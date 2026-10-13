package com.vaultor.vaultor.host;

import com.vaultor.vaultor.service.WorkspaceIdentityService;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;

/** Host-private catalog; portable exports never read this file. Existing storage is adopted in place. */
@Component
public class WorkspaceCatalog {
    public static final int LIMIT=8;
    public record Entry(String id,String name) {}
    public record State(int version,String defaultId,List<Entry> workspaces,Map<String,Map<String,Boolean>> grants) {}
    private final ObjectMapper json;
    public final Path directory;
    private final Path store;
    private State state;
    private final Map<String,String> reservations=new LinkedHashMap<>();
    public WorkspaceCatalog(HostAccess access,WorkspaceIdentityService identity,JdbcTemplate jdbc,ObjectMapper json) throws Exception {
        this.json=json;directory=access.directory.resolveSibling("workspaces");
        Files.createDirectories(directory);HostFiles.privatePath(directory,true);
        if(Files.isSymbolicLink(directory))throw new IllegalStateException("Workspace catalog directory must not be a symbolic link");
        store=directory.resolve("catalog.json");String legacy=identity.current().id();
        if(Files.isSymbolicLink(store))throw new IllegalStateException("Invalid workspace catalog file");
        if(Files.exists(store)) {
            if(Files.size(store)>1024*1024)throw new IllegalStateException("Workspace catalog is too large; nothing was reset");
            state=json.readValue(Files.readAllBytes(store),State.class);validate(state);
            if(!state.defaultId().equals(legacy))throw new IllegalStateException("Legacy workspace identity differs from catalog; restore the matching data/catalog checkpoint");
        } else {
            try(var contents=Files.list(directory)){if(contents.anyMatch(p->p.getFileName().toString().matches("[a-f0-9-]{36}")))throw new IllegalStateException("Workspace catalog is missing; restore it before opening existing workspace directories");}
            // No live files move, and no existing schema is rewritten. SQLite produces a consistent checkpoint.
            Path checkpoint=directory.resolve("legacy-adoption.db");
            if(!Files.exists(checkpoint)){Path pending=directory.resolve("adoption-"+UUID.randomUUID()+".tmp");jdbc.execute("VACUUM INTO '"+pending.toString().replace("'","''")+"'");Files.move(pending,checkpoint,StandardCopyOption.ATOMIC_MOVE);}
            if(!Files.isRegularFile(checkpoint) || Files.size(checkpoint)==0)throw new IllegalStateException("Legacy adoption checkpoint is unavailable");
            if(Files.isSymbolicLink(checkpoint))throw new IllegalStateException("Invalid adoption checkpoint");
            try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite:"+checkpoint);var statement=connection.createStatement()){try(var result=statement.executeQuery("PRAGMA quick_check")){if(!result.next() || !"ok".equals(result.getString(1)))throw new IllegalStateException("Adoption checkpoint is damaged");}}
            HostFiles.privatePath(checkpoint,false);
            persist(new State(1,legacy,List.of(new Entry(legacy,"My workspace")),Map.of()));
        }
    }
    private static void uuid(String id){if(id==null || !id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))throw new AccessFailure(400,"INVALID_WORKSPACE","Use a canonical workspace ID");}
    private static String name(String name){if(name==null || name.isBlank() || name.strip().length()>100 || name.chars().anyMatch(Character::isISOControl))throw new AccessFailure(400,"INVALID_WORKSPACE_NAME","Workspace names contain 1–100 characters");return name.strip();}
    private static void validate(State s){
        if(s==null || s.version()!=1 || s.workspaces()==null || s.workspaces().isEmpty() || s.workspaces().size()>LIMIT || s.grants()==null)throw new IllegalStateException("Damaged workspace catalog; nothing was reset");
        var ids=new HashSet<String>();for(var e:s.workspaces()){uuid(e.id());name(e.name());if(!ids.add(e.id()))throw new IllegalStateException("Duplicate workspace catalog identity");}
        if(!ids.contains(s.defaultId()) || !ids.containsAll(s.grants().keySet()))throw new IllegalStateException("Invalid catalog default/grants");
        for(var grants:s.grants().values()){if(grants==null || grants.size()>1000)throw new IllegalStateException("Invalid workspace grants");for(var g:grants.entrySet()){uuid(g.getKey());if(g.getValue()==null)throw new IllegalStateException("Invalid workspace grant");}}
    }
    private void persist(State next) throws Exception {validate(next);HostFiles.write(store,json.writeValueAsBytes(next));state=next;}
    public synchronized String defaultId(){return state.defaultId();}
    public synchronized Entry require(String id){uuid(id);return state.workspaces().stream().filter(e->e.id().equals(id)).findFirst().orElseThrow(()->new AccessFailure(404,"WORKSPACE_UNAVAILABLE","Workspace is unavailable or not authorized"));}
    public synchronized boolean allowed(String id,String device){
        if(state.workspaces().stream().noneMatch(e->e.id().equals(id)))return false;
        // Existing and later ordinary pairings receive only the fixed legacy workspace. Explicit denial wins.
        return state.grants().getOrDefault(id,Map.of()).getOrDefault(device,id.equals(state.defaultId()));
    }
    public synchronized List<Entry> list(String device){return state.workspaces().stream().filter(e->device==null || allowed(e.id(),device)).toList();}
    public synchronized Entry create(String id,String label) throws Exception {
        uuid(id);String n=name(label);var old=state.workspaces().stream().filter(e->e.id().equals(id)).findFirst();
        if(old.isPresent()){if(!old.get().name().equals(n))throw new AccessFailure(409,"WORKSPACE_ID_CONFLICT","This workspace ID already has another name");return old.get();}
        if(reservations.containsKey(id))throw new AccessFailure(409,"WORKSPACE_IMPORT_PENDING","This identity belongs to a pending workspace import");
        if(state.workspaces().size()+reservations.size()>=LIMIT)throw new AccessFailure(409,"WORKSPACE_LIMIT","This host supports at most eight workspaces");
        var next=new ArrayList<>(state.workspaces());var entry=new Entry(id,n);next.add(entry);persist(new State(1,state.defaultId(),List.copyOf(next),state.grants()));return entry;
    }
    public synchronized Entry rename(String id,String label) throws Exception {
        require(id);var entry=new Entry(id,name(label));var next=state.workspaces().stream().map(e->e.id().equals(id)?entry:e).toList();persist(new State(1,state.defaultId(),next,state.grants()));return entry;
    }
    public synchronized void grant(String id,String device,boolean allow) throws Exception {
        require(id);uuid(device);var all=new LinkedHashMap<>(state.grants());var next=new LinkedHashMap<>(all.getOrDefault(id,Map.of()));next.put(device,allow);all.put(id,Map.copyOf(next));persist(new State(1,state.defaultId(),state.workspaces(),Map.copyOf(all)));
    }
    public synchronized void reserve(String id,String label) {
        uuid(id);String n=name(label);if(state.workspaces().stream().anyMatch(e->e.id().equals(id)))throw new AccessFailure(409,"WORKSPACE_ID_CONFLICT","Workspace already exists");
        if(reservations.containsKey(id)){if(!reservations.get(id).equals(n))throw new AccessFailure(409,"WORKSPACE_ID_CONFLICT","Pending import has another name");return;}
        if(state.workspaces().size()+reservations.size()>=LIMIT)throw new AccessFailure(409,"WORKSPACE_LIMIT","This host supports at most eight workspaces");reservations.put(id,n);
    }
    public synchronized Entry publish(String id,String label) throws Exception {
        var published=state.workspaces().stream().filter(e->e.id().equals(id)).findFirst();if(published.isPresent()){reservations.remove(id);return published.get();}
        String reserved=reservations.remove(id);try{return create(id,label);}catch(Exception e){if(reserved!=null)reservations.put(id,reserved);throw e;}
    }
    public synchronized void release(String id){reservations.remove(id);}
    public Path root(String id){require(id);return directory.resolve(id);}
}
