package com.vaultor.vaultor.service;

import com.vaultor.vaultor.host.AccessFailure;
import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** Separate evidence and triage state. No FK/cascade to originals: purge retains evidence. */
@Service
public class ReviewService {
    private final JdbcTemplate jdbc;
    private final ResourceRepository resources;
    private final WorkspaceIdentityService identity;
    private final ObjectMapper json;
    private final ChangeFeed changes;
    public ReviewService(JdbcTemplate jdbc,ResourceRepository resources,WorkspaceIdentityService identity,ObjectMapper json,ChangeFeed changes) {
        this.jdbc=jdbc;this.resources=resources;this.identity=identity;this.json=json;this.changes=changes;
    }
    @PostConstruct void init() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS review_items (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, fingerprint TEXT NOT NULL, evidence TEXT NOT NULL, status TEXT NOT NULL, revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,generation TEXT NOT NULL)");
        // Unpublished unscoped candidates cannot be assigned to the current generation by guesswork.
        boolean scoped=jdbc.queryForList("PRAGMA table_info(review_items)").stream().anyMatch(c->"generation".equals(c.get("name")));
        if(!scoped)jdbc.execute("ALTER TABLE review_items ADD COLUMN generation TEXT NOT NULL DEFAULT 'unscoped'");
        jdbc.execute("CREATE INDEX IF NOT EXISTS review_target_scope ON review_items(generation,resource_id,status,created_at,id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS review_status_scope ON review_items(generation,status,created_at,id)");
    }
    public record Locator(String kind,String path,Integer page) {}
    public record Input(String generation,String resourceId,String comment,String quote,String context,Locator locator,String baseRevision) {}
    /** Portable provenance has no host/device credential, source identity, generation or server revision. */
    public record Portable(String id,String resourceId,String targetTitle,String targetType,String comment,String quote,String context,Locator locator,String author,String createdAt,String updatedAt,String status) {}
    public record Evidence(Portable portable,String baseRevision) {}
    public record Item(String id,String resourceId,String targetTitle,String targetType,String comment,String quote,String context,Locator locator,String author,String createdAt,String updatedAt,String status,String revision,String availability,String attachment) {}
    public record Page(List<Item> items,int page,int size,long totalItems,long totalPages,Map<String,Long> counts,String generation) {}
    private record Row(String id,String target,String fingerprint,Evidence evidence,String status,String revision,String created,String updated) {}
    private static void require(boolean ok,String message) {if(!ok)throw new AccessFailure(400,"INVALID_REVIEW",message);}
    private static String text(String s,int max,boolean required) {
        require(s!=null || !required,"Review comment is required");s=s==null?"":s;
        require(s.length()<=max && (!required || !s.isBlank()) && s.chars().noneMatch(c->c==0 || c<32 && c!='\n' && c!='\r' && c!='\t'),"Invalid review text or length");return s;
    }
    private static String uuid(String s) {try{return UUID.fromString(s).toString();}catch(Exception e){throw new AccessFailure(400,"INVALID_REVIEW","Use a UUID review/resource identity");}}
    private static Locator locator(Locator l) {
        if(l==null)return null;
        require(l.kind()!=null && Set.of("block","page","resource").contains(l.kind()),"Unsupported review locator");
        if("page".equals(l.kind()))require(l.page()!=null && l.page()>=1 && l.page()<=100000 && l.path()==null,"Invalid page locator");
        else if("block".equals(l.kind()))require(l.path()!=null && l.path().matches("[0-9]{1,5}(?:\\.[0-9]{1,5}){0,63}") && l.path().length()<=300 && l.page()==null,"Invalid block locator");
        else require(l.path()==null && l.page()==null,"Invalid resource locator");
        return l;
    }
    private Input normalize(Input i) {
        require(i!=null,"Review body is required");
        return new Input(text(i.generation(),100,true),uuid(i.resourceId()),text(i.comment(),5000,true),text(i.quote(),4000,false),text(i.context(),4000,false),locator(i.locator()),text(i.baseRevision(),100,false));
    }
    private String hash(Input i) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(i).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private Row row(String id) {
        return jdbc.query("SELECT * FROM review_items WHERE id=? AND generation=?",(r,n)->new Row(r.getString("id"),r.getString("resource_id"),r.getString("fingerprint"),json.readValue(r.getString("evidence"),Evidence.class),r.getString("status"),r.getString("revision"),r.getString("created_at"),r.getString("updated_at")),id,identity.current().generation()).stream().findFirst().orElseThrow(()->new AccessFailure(404,"REVIEW_NOT_FOUND","Review item not found in this workspace generation"));
    }
    private void generation(String expected) {if(!identity.current().generation().equals(expected))throw new AccessFailure(409,"REVIEW_GENERATION_CHANGED","Workspace was replaced. Keep this evidence for its original source; do not send it to the replacement.");}
    @Transactional public Item create(String id,Input raw,String author) {
        id=uuid(id);Input i=normalize(raw);generation(i.generation());String fingerprint=hash(i);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM review_items WHERE id=?",Integer.class,id)>0) {
            if(!i.generation().equals(jdbc.queryForObject("SELECT generation FROM review_items WHERE id=?",String.class,id)))throw new AccessFailure(409,"REVIEW_GENERATION_CHANGED","Review identity belongs to a former workspace generation; retained evidence cannot be reassigned.");
            Row old=row(id);if(!old.fingerprint().equals(fingerprint))throw new AccessFailure(409,"REVIEW_ID_REUSED","Review identity already has different evidence");return dto(old);
        }
        Resource target=resources.findById(i.resourceId()).orElseThrow(()->new AccessFailure(404,"RESOURCE_NOT_FOUND","Target is unavailable. Keep the review evidence on its source device."));
        require(!Boolean.TRUE.equals(target.getPurgePending()),"Target deletion is pending");
        if(i.locator()!=null && "block".equals(i.locator().kind()))require("note".equals(target.getType()),"Block locators require a note");
        if(i.locator()!=null && "page".equals(i.locator().kind()))require("application/pdf".equals(target.getMimeType()),"Page locators require a PDF");
        if(jdbc.queryForObject("SELECT COUNT(*) FROM review_items",Integer.class)>=10000)throw new AccessFailure(409,"REVIEW_LIMIT","Workspace review limit reached (10000). Export/retain evidence before adding more.");
        String now=Instant.now().toString();String label=text(author,100,true);
        var portable=new Portable(id,i.resourceId(),target.getTitle(),target.getType(),i.comment(),i.quote(),i.context(),i.locator(),label,now,now,"open");
        jdbc.update("INSERT INTO review_items(id,resource_id,fingerprint,evidence,status,revision,created_at,updated_at,generation) VALUES (?,?,?,?,?,?,?,?,?)",id,i.resourceId(),fingerprint,json.writeValueAsString(new Evidence(portable,i.baseRevision())),"open",UUID.randomUUID().toString(),now,now,i.generation());
        changed(id,i.resourceId());return dto(row(id));
    }
    @Transactional(readOnly=true) public Item get(String id) {return dto(row(uuid(id)));}
    @Transactional public Item status(String id,String state,String match,String expectedGeneration) {
        generation(expectedGeneration);id=uuid(id);require(state!=null && Set.of("open","resolved","dismissed").contains(state),"Invalid review status");
        Row old=row(id);if(match==null)throw new AccessFailure(428,"REVIEW_REVISION_REQUIRED","Refresh this review and send If-Match before changing its status");
        if(!match.equals('"'+old.revision()+'"'))throw new AccessFailure(412,"REVIEW_CONFLICT","This review changed on another device. Refresh it and choose the status again.");
        if(state.equals(old.status()))return dto(old);
        int updated=jdbc.update("UPDATE review_items SET status=?,revision=?,updated_at=? WHERE id=? AND revision=?",state,UUID.randomUUID().toString(),Instant.now().toString(),id,old.revision());
        if(updated!=1)throw new AccessFailure(412,"REVIEW_CONFLICT","This review changed on another device. Refresh it before retrying.");
        changed(id,old.target());return dto(row(id));
    }
    private void changed(String id,String target) {changes.committed("reviews",List.of(id,target),org.slf4j.MDC.get("requestId"));}
    @Transactional(readOnly=true) public Page list(String state,String target,int page,int size) {
        require(state!=null && Set.of("all","open","resolved","dismissed").contains(state),"Invalid status filter");require(page>=0 && page<=100000 && size>=1 && size<=100,"Review page size must be 1–100");
        if(target!=null)target=uuid(target);
        String where=" WHERE generation=?";List<Object> args=new ArrayList<>();args.add(identity.current().generation());if(target!=null){where+=" AND resource_id=?";args.add(target);}
        Map<String,Long> counts=new LinkedHashMap<>();for(String value:List.of("open","resolved","dismissed")){var a=new ArrayList<>(args);a.add(value);counts.put(value,jdbc.queryForObject("SELECT COUNT(*) FROM review_items"+where+" AND status=?",Long.class,a.toArray()));}
        if(!state.equals("all")){where+=" AND status=?";args.add(state);}
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM review_items"+where,Long.class,args.toArray());args.add(size);args.add((long)page*size);
        var ids=jdbc.queryForList("SELECT id FROM review_items"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",String.class,args.toArray());
        return new Page(ids.stream().map(id->dto(row(id))).toList(),page,size,total,(total+size-1)/size,counts,identity.current().generation());
    }
    private Item dto(Row r) {
        var p=r.evidence().portable();var resource=resources.findById(r.target()).orElse(null);
        String available=resource==null?"missing":Boolean.TRUE.equals(resource.getPurgePending())?"deleting":resource.getTrashedAt()!=null?"trashed":"available";
        String attached="resource";
        if(!p.quote().isEmpty() || p.locator()!=null && "block".equals(p.locator().kind())) {
            attached=resource==null?"unavailable":!resource.getRevision().equals(r.evidence().baseRevision())?"changed":"unverified";
            if("unverified".equals(attached) && "note".equals(resource.getType())) {
                JsonNode block=json.readTree(resource.getContent());
                if(p.locator()!=null && "block".equals(p.locator().kind()))for(String part:p.locator().path().split("\\.")){block=block.path("content").path(Integer.parseInt(part));}
                String content=savedText(block);attached=!p.quote().isEmpty() && content.contains(p.quote()) && (p.context().isEmpty() || content.contains(p.context()))?"attached":"unverified";
            }
        }
        return new Item(r.id(),r.target(),resource==null?p.targetTitle():resource.getTitle(),p.targetType(),p.comment(),p.quote(),p.context(),p.locator(),p.author(),r.created(),r.updated(),r.status(),r.revision(),available,attached);
    }
    private String savedText(JsonNode node) {StringBuilder b=new StringBuilder();appendText(node,b,0);return b.toString();}
    private void appendText(JsonNode n,StringBuilder b,int depth) {if(depth>64 || b.length()>1048576)return;if(n.has("text"))b.append(n.path("text").asText());for(JsonNode c:n.path("content"))appendText(c,b,depth+1);if(Set.of("paragraph","heading").contains(n.path("type").asText()))b.append('\n');}
    @Transactional(readOnly=true) public List<Portable> snapshot(Set<String> selection) {
        return jdbc.queryForList("SELECT id FROM review_items WHERE generation=? ORDER BY created_at,id",String.class,identity.current().generation()).stream().map(this::row).filter(r->selection==null || selection.contains(r.target())).map(r->{var p=r.evidence().portable();return new Portable(r.id(),r.target(),p.targetTitle(),p.targetType(),p.comment(),p.quote(),p.context(),p.locator(),p.author(),r.created(),r.updated(),r.status());}).toList();
    }
    public void validatePortable(List<Portable> items) {
        require(items!=null && items.size()<=10000,"Invalid review archive section");Set<String> ids=new HashSet<>();
        for(var p:items) {require(p!=null,"Invalid archived review");require(ids.add(uuid(p.id())),"Duplicate archived review");uuid(p.resourceId());text(p.targetTitle(),500,true);require(Set.of("note","file").contains(p.targetType()),"Invalid review target type");text(p.comment(),5000,true);text(p.quote(),4000,false);text(p.context(),4000,false);locator(p.locator());text(p.author(),100,true);require(Set.of("open","resolved","dismissed").contains(p.status()),"Invalid archived status");try{Instant.parse(p.createdAt());Instant.parse(p.updatedAt());}catch(Exception e){throw new AccessFailure(400,"INVALID_REVIEW","Invalid archived review timestamps");}}
    }
    /** Caller holds transfer gate/transaction. Merge remaps evidence, including unavailable target IDs. */
    public void restore(List<Portable> items,Map<String,String> ids,boolean replace) {
        if(replace)jdbc.update("DELETE FROM review_items");if(items==null)return;validatePortable(items);
        require(jdbc.queryForObject("SELECT COUNT(*) FROM review_items",Integer.class)+items.size()<=10000,"Merged reviews exceed 10000");
        for(var p:items) {String id=replace?p.id():UUID.randomUUID().toString();String target=ids.computeIfAbsent(p.resourceId(),k->replace?k:UUID.randomUUID().toString());var portable=new Portable(id,target,p.targetTitle(),p.targetType(),p.comment(),text(p.quote(),4000,false),text(p.context(),4000,false),p.locator(),p.author(),p.createdAt(),p.updatedAt(),p.status());jdbc.update("INSERT INTO review_items(id,resource_id,fingerprint,evidence,status,revision,created_at,updated_at,generation) VALUES (?,?,?,?,?,?,?,?,?)",id,target,"imported:"+UUID.randomUUID(),json.writeValueAsString(new Evidence(portable,"imported")),p.status(),UUID.randomUUID().toString(),p.createdAt(),p.updatedAt(),identity.current().generation());}
    }
}
