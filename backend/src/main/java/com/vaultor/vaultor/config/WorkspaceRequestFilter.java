package com.vaultor.vaultor.config;

import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.workspaces.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.slf4j.MDC;
import java.io.IOException;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** Authenticate before workspace authorization, context opening and maintenance admission. */
@Component @Order(Ordered.HIGHEST_PRECEDENCE+2)
public class WorkspaceRequestFilter extends OncePerRequestFilter {
    private final WorkspaceCatalog catalog;private final WorkspaceRegistry registry;private final ObjectMapper json;
    public WorkspaceRequestFilter(WorkspaceCatalog catalog,WorkspaceRegistry registry,ObjectMapper json){this.catalog=catalog;this.registry=registry;this.json=json;}
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        String path=req.getRequestURI();
        boolean scoped=path.matches("/api/(resources|tags|settings|collections|organization|reviews|workspace|imports|exports|operations|companions|changes|diagnostics)(/.*)?") || Set.of("/api/health","/api/capabilities","/api/openapi.json","/api/export-formats").contains(path);
        if(!scoped){chain.doFilter(req,res);return;}
        String id=req.getHeader("X-Vaultor-Workspace");
        if(id==null && "/api/capabilities".equals(path) && "PUBLIC".equals(req.getAttribute(HostAccessFilter.PRINCIPAL))){chain.doFilter(req,res);return;}
        if(id==null)id=catalog.defaultId();
        try {
            String device=WorkspaceController.device(req);catalog.require(id);
            if(device!=null && !catalog.allowed(id,device))throw new AccessFailure(404,"WORKSPACE_UNAVAILABLE","Workspace is unavailable or not authorized");
            var runtime=registry.open(id);
            if(device!=null && !catalog.allowed(id,device))throw new AccessFailure(404,"WORKSPACE_UNAVAILABLE","Workspace is unavailable or not authorized");
            res.setHeader("X-Vaultor-Workspace",id);
            boolean guarded=path.matches("/api/(resources|tags|settings|collections|organization|reviews|workspace)(/.*)?");
            boolean transfer=path.matches("/api/companions(/.*)?") || !List.of("GET","HEAD","OPTIONS").contains(req.getMethod()) && path.matches("/api/(imports|exports|operations|companions)(/.*)?");
            var gate=runtime.gate();boolean entered=transfer?gate.enterTransferRequest():!guarded || gate.enterRequest();
            try {
                if(!entered){var busy=gate.diagnostic();req.setAttribute("workspaceBusy",busy);org.slf4j.LoggerFactory.getLogger(WorkspaceRequestFilter.class).info("workspace busy workspace={} generation={} owner={} phase={} durationMs={}",id,req.getHeader("X-Vaultor-Generation"),busy.owner(),busy.phase(),busy.durationMs());throw new AccessFailure(409,"WORKSPACE_BUSY","Workspace maintenance is in progress. Retry shortly.");}
                String expected=req.getHeader("X-Vaultor-Generation");
                if(expected!=null && (guarded||transfer) && !expected.equals(runtime.context().getBean(com.vaultor.vaultor.service.WorkspaceIdentityService.class).current().generation()))throw new AccessFailure(409,"WORKSPACE_GENERATION_CHANGED","Workspace was replaced; return to the original import source");
                if(runtime.dispatcher()==null)chain.doFilter(req,res);else {runtime.dispatcher().service(req,res);ChangeNotificationFilter.publish(req,res,runtime.feed());}
            } finally {if(guarded && entered)gate.leaveRequest();if(transfer && entered)gate.leaveTransferRequest();}
        } catch(AccessFailure failure){
            if(res.isCommitted())throw failure;
            var problem=new LinkedHashMap<String,Object>();problem.put("status",failure.status);problem.put("code",failure.code);problem.put("detail",failure.getMessage());problem.put("requestId",Optional.ofNullable(MDC.get("requestId")).orElse(""));if(req.getAttribute("workspaceBusy")!=null)problem.put("busy",req.getAttribute("workspaceBusy"));
            res.setStatus(failure.status);res.setContentType("application/problem+json");res.getWriter().write(json.writeValueAsString(problem));
        } catch(ServletException|IOException failure){throw failure;}
        catch(Exception failure){throw new ServletException("Workspace context unavailable; existing data was retained",failure);}
    }
}
