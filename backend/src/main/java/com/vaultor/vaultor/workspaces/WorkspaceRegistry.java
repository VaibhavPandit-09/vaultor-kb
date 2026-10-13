package com.vaultor.vaultor.workspaces;

import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.TransferOperationRepository;
import org.springframework.stereotype.Component;
import org.springframework.core.env.MapPropertySource;
import org.springframework.web.context.ConfigurableWebApplicationContext;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.*;
import java.nio.file.*;
import java.util.*;

/** One bounded independent JPA/domain/worker context per workspace, in the same JVM. */
@Component
public class WorkspaceRegistry {
    public record Runtime(ConfigurableWebApplicationContext context,DispatcherServlet dispatcher) {
        public WorkspaceGate gate(){return context.getBean(WorkspaceGate.class);}
        public ChangeFeed feed(){return context.getBean(ChangeFeed.class);}
    }
    private final ConfigurableWebApplicationContext main;
    private final WorkspaceCatalog catalog;
    private final HostAccess access;
    private final Map<String,Runtime> children=new LinkedHashMap<>();
    private boolean stopping;
    public WorkspaceRegistry(ConfigurableWebApplicationContext main,WorkspaceCatalog catalog,HostAccess access){this.main=main;this.catalog=catalog;this.access=access;main.getBean(ChangeFeed.class).authorize(id->access.deviceActive(id)&&catalog.allowed(catalog.defaultId(),id));}
    public synchronized Runtime open(String id) throws Exception {
        catalog.require(id);if(stopping)throw new AccessFailure(503,"HOST_STOPPING","Host is stopping; reconnect shortly");
        if(id.equals(catalog.defaultId()))return new Runtime(main,null);
        var existing=children.get(id);if(existing!=null)return existing;
        Path root=catalog.root(id);
        if(Files.isSymbolicLink(root) || Files.isSymbolicLink(root.resolve("files")) || Files.isSymbolicLink(root.resolve("app.db")) || Files.isSymbolicLink(root.resolve("operations")))throw new IllegalStateException("Invalid workspace storage directory");
        Files.createDirectories(root.resolve("files"));
        var context=new AnnotationConfigWebApplicationContext();context.setId("workspace-"+id);context.setServletContext(main.getServletContext());
        // Copy configuration, not beans: repository proxies and workers must never fall back to main storage.
        context.getEnvironment().merge(main.getEnvironment());
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("workspace-storage",Map.of(
            "spring.datasource.url","jdbc:sqlite:"+root.resolve("app.db"),"app.storage.path",root.resolve("files").toString(),
            "app.workspace.id",id,"spring.jmx.enabled","false")));
        context.addBeanFactoryPostProcessor(factory->factory.registerSingleton("hostAccess",access));
        context.register(com.vaultor.workspace.WorkspaceConfiguration.class);
        try {
            context.refresh();
            if(!id.equals(context.getBean(WorkspaceIdentityService.class).current().id()))throw new IllegalStateException("Workspace storage identity mismatch");
            context.getBean(ChangeFeed.class).authorize(device->access.deviceActive(device)&&catalog.allowed(id,device));
            var dispatcher=new DispatcherServlet(context);dispatcher.setPublishContext(false);dispatcher.init(new ServletConfig(){public String getServletName(){return "workspace-"+id;}public ServletContext getServletContext(){return main.getServletContext();}public String getInitParameter(String n){return null;}public Enumeration<String> getInitParameterNames(){return Collections.emptyEnumeration();}});
            var runtime=new Runtime(context,dispatcher);children.put(id,runtime);return runtime;
        } catch(Exception failure){context.close();throw failure;}
    }
    public synchronized void revoke(String id,String device){if(id.equals(catalog.defaultId()))main.getBean(ChangeFeed.class).disconnectDevice(device);else if(children.containsKey(id))children.get(id).feed().disconnectDevice(device);}
    public synchronized void quiesce(){stopping=true;main.getBean(WorkspaceGate.class).quiesce();main.getBean(ChangeFeed.class).restarting();for(var r:children.values()){r.gate().quiesce();r.feed().restarting();}}
    public boolean drained(){var all=new ArrayList<ConfigurableWebApplicationContext>();synchronized(this){all.add(main);children.values().forEach(r->all.add(r.context()));}return all.stream().allMatch(c->c.getBean(WorkspaceGate.class).requestsDrained() && c.getBean(TransferOperationRepository.class).countByStatusIn(List.of("QUEUED","RUNNING","CLEANUP"))==0);}
    public synchronized void resume(){stopping=false;main.getBean(WorkspaceGate.class).resume();children.values().forEach(r->r.gate().resume());}
    @PreDestroy public synchronized void close(){stopping=true;for(var r:children.values()){r.gate().quiesce();r.context().close();}children.clear();}
}
