package com.vaultor.vaultor.service;
import com.vaultor.vaultor.model.ResourceCollection;
import com.vaultor.vaultor.repository.*;
import com.vaultor.vaultor.controller.ApiDtos.PageDto;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;

@Service @RequiredArgsConstructor
public class OrganizationService {
    private final CollectionDeletionService deletions;
    private final CollectionRepository collections;
    private final JdbcTemplate jdbc;
    private final ResourceBrowseService browse;
    public record Ancestor(String id,String name) {}
    public record CollectionDto(String id,String name,boolean favorite,long count,String parentId,List<Ancestor> ancestors,long childCount) {}
    public record CollectionPage(List<CollectionDto> items,int page,int size,long totalItems,int totalPages,boolean exactMatch) {}
    public record TagSummary(String id,String name,String color,long count) {}
    public record CollectionData(String id,String name,boolean favorite,List<String> resources,String parentId) { public CollectionData(String id,String name,boolean favorite,List<String> resources) { this(id,name,favorite,resources,null); } }
    public record OrganizationData(List<CollectionData> collections,List<String> favorites) {}
    public OrganizationData snapshot() {
        Map<String,List<String>> members=new HashMap<>();
        jdbc.query("select collection_id,resource_id from resource_collections order by resource_id",(org.springframework.jdbc.core.RowCallbackHandler)rs -> members.computeIfAbsent(rs.getString(1),k->new ArrayList<>()).add(rs.getString(2)));
        return new OrganizationData(collections.findAll().stream().map(c->new CollectionData(c.getId(),c.getName(),c.isFavorite(),members.getOrDefault(c.getId(),List.of()),c.getParentId())).toList(),jdbc.queryForList("select id from resources where favorite=1 order by id",String.class));
    }
    public static void validate(OrganizationData data,Set<String> resourceIds) {
        if(data==null || data.collections()==null || data.favorites()==null || !resourceIds.containsAll(data.favorites())) throw new IllegalArgumentException("Invalid organization or favorite references");
        Set<String> ids=new HashSet<>(),names=new HashSet<>();
        for(var c:data.collections()) {
            if(c==null || c.id()==null || !c.id().matches("[a-zA-Z0-9-]{1,80}") || !ids.add(c.id()) || !names.add(key(c.parentId(),name(c.name()))) || c.resources()==null || !resourceIds.containsAll(c.resources()) || new HashSet<>(c.resources()).size()!=c.resources().size()) throw new IllegalArgumentException("Invalid collection or membership references");
        }
        var parents=new HashMap<String,String>();for(var c:data.collections())parents.put(c.id(),c.parentId());validateTree(parents);
    }
    public void clear() { jdbc.update("delete from resource_collections"); collections.deleteAll();collections.flush(); }
    public void restore(OrganizationData data,Map<String,String> ids,boolean merge) {
        var mapped=new HashMap<String,String>();var remaining=new ArrayList<>(data.collections());
        while(!remaining.isEmpty()) {
            boolean progress=false;
            for(var iterator=remaining.iterator();iterator.hasNext();) {
                var c=iterator.next();if(c.parentId()!=null&&!mapped.containsKey(c.parentId()))continue;
                String parent=c.parentId()==null?null:mapped.get(c.parentId());String normalized=key(parent,c.name());
                var existing=collections.findByNormalizedName(normalized);var entity=existing.orElseGet(ResourceCollection::new);
                if(existing.isEmpty()){if(!merge)entity.setId(c.id());entity.setName(name(c.name()));entity.setParentId(parent);entity.setNormalizedName(normalized);entity.setFavorite(c.favorite());collections.saveAndFlush(entity);}
                mapped.put(c.id(),entity.getId());
                for(String id:c.resources())jdbc.update("insert into resource_collections(resource_id,collection_id) values(?,?)",ids.get(id),entity.getId());
                iterator.remove();progress=true;
            }
            if(!progress)throw new IllegalArgumentException("Invalid collection hierarchy");
        }
        for(String id:data.favorites()) jdbc.update("update resources set favorite=1 where id=?",ids.get(id));
    }

    public record CreationInput(String name,List<String> resourceIds,String parentId) {public CreationInput(String name,List<String> resourceIds){this(name,resourceIds,null);}}
    public record SelectionInput(List<String> resourceIds) {}
    public record MembershipDto(String id,String name,long selectedCount,List<Ancestor> ancestors) {}
    public record PinnedItem(String id,String kind,String name,long count,com.vaultor.vaultor.controller.ApiDtos.ResourceSummary resource,CollectionDto collection) {}
    public record PinsPage(List<PinnedItem> items,int page,int size,long totalItems,int totalPages,String appliedKind,String appliedCategory) {}
    private List<String> selection(List<String> ids,boolean emptyAllowed) {
        if(ids==null || (!emptyAllowed && ids.isEmpty()) || ids.size()>100 || ids.stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("Select up to 100 resource IDs");
        var result=ids.stream().distinct().sorted().toList();
        for(String id:result) if(jdbc.queryForObject("select count(*) from resources where id=? and trashed_at is null",Long.class,id)!=1) throw new NoSuchElementException("Resource not found");
        return result;
    }
    @Transactional(readOnly=true) public CollectionDto get(String id) {
        var c=collections.findById(id).orElseThrow();
        return dto(c,jdbc.queryForObject("select count(*) from resource_collections where resource_id in (select id from resources where trashed_at is null) and collection_id=?",Long.class,id));
    }
    @Transactional public CollectionDto createOnce(String id,CreationInput input) {
        if(!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Creation ID must be a canonical UUID");
        String display=name(input.name());
        if(input.resourceIds()==null || input.resourceIds().size()>100 || input.resourceIds().stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("Provide up to 100 resource IDs");
        var ids=input.resourceIds().stream().sorted().distinct().toList();
        String fingerprint;
        try { fingerprint=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((display+"\0"+String.join("\0",ids)+(input.parentId()==null?"":"\0parent:"+input.parentId())).getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
        var existing=collections.findById(id);
        if(existing.isPresent()) {
            if(!fingerprint.equals(existing.get().getCreationFingerprint())) throw new ResponseStatusException(HttpStatus.CONFLICT,"Creation ID already used with a different request");
            return get(id); // Never reapply membership after an uncertain response.
        }
        validateParent(id,input.parentId());
        selection(input.resourceIds(),true);
        if(collections.findByNormalizedName(key(input.parentId(),display)).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT,"A collection with this name already exists");
        var c=new ResourceCollection();c.setId(id);c.setName(display);c.setNormalizedName(key(input.parentId(),display));c.setParentId(input.parentId());c.setCreationFingerprint(fingerprint);
        collections.saveAndFlush(c);
        if(!ids.isEmpty()) bulk(new BulkInput(ids,"collection",id,"add"));
        return get(id);
    }
    @Transactional(readOnly=true) public List<MembershipDto> memberships(SelectionInput input) {
        var ids=selection(input.resourceIds(),false);
        String slots=String.join(",",Collections.nCopies(ids.size(),"?"));
        return jdbc.query("select c.id,c.name,count(*) from collections c join resource_collections rc on rc.collection_id=c.id where rc.resource_id in ("+slots+") group by c.id,c.name order by c.normalized_name,c.id",(rs,n)->new MembershipDto(rs.getString(1),rs.getString(2),rs.getLong(3),dto(collections.findById(rs.getString(1)).orElseThrow(),0).ancestors()),ids.toArray());
    }
    @Transactional public void pin(String id,Boolean value) {
        if(value==null) throw new IllegalArgumentException("favorite is required");
        if(jdbc.update("update collections set favorite=? where id=?",value,id)!=1) throw new NoSuchElementException("Collection not found");
    }
    @Transactional(readOnly=true) public PinsPage pins(String q,int page,int size) { return pins(q,page,size,null); }
    @Transactional(readOnly=true) public PinsPage pins(String q,int page,int size,String kind) {
        return pins(q,page,size,kind,null);
    }
    @Transactional(readOnly=true) public PinsPage pins(String q,int page,int size,String kind,String category) {
        paging(page,size);
        if(kind!=null && !kind.matches("[a-zA-Z0-9_-]{1,80}")) throw new IllegalArgumentException("Invalid shortcut kind");
        String from=" from (select id,type as kind,title as name,0 as members,mime_type from resources where favorite=1 and trashed_at is null union all select c.id,'collection' as kind,c.name,(select count(*) from resource_collections rc join resources active on active.id=rc.resource_id where active.trashed_at is null and rc.collection_id=c.id) as members,null as mime_type from collections c where c.favorite=1) p where lower(name) like ? escape '!'";
        var args=new ArrayList<Object>();args.add(query(q));
        if(kind!=null && !kind.equals("all")){from+=" and kind=?";args.add(kind);}
        if(category!=null&&!category.isBlank()) {
            if(!FileCategories.VALUES.contains(category))throw new IllegalArgumentException("Unknown file category");
            from+=" and kind='file' and ("+FileCategories.expression("r").replace("r.type","p.kind").replace("r.mime_type","p.mime_type")+")=?";args.add(category);
        }
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        var items=jdbc.query("select id,kind,name,members"+from+" order by lower(name),kind,id limit ? offset ?",(rs,n)->new PinnedItem(rs.getString(1),rs.getString(2),rs.getString(3),rs.getLong(4),null,null),args.toArray());
        var summaries=browse.byIds(items.stream().filter(p->!p.kind().equals("collection")).map(PinnedItem::id).toList());
        items=items.stream().map(p->new PinnedItem(p.id(),p.kind(),p.name(),p.count(),summaries.get(p.id()),p.kind().equals("collection")?get(p.id()):null)).toList();
        return new PinsPage(items,page,size,total,(int)((total+size-1)/size),kind==null?"all":kind,category);
    }

    public record CollectionInput(String name,Boolean favorite) {}
    public record BulkInput(List<String> resourceIds,String kind,String targetId,String action) {}
    public static String name(String value) {
        if(value==null || value.isBlank() || value.trim().length()>100 || value.chars().anyMatch(c->c<32)) throw new IllegalArgumentException("Name must contain 1–100 characters");
        return value.trim();
    }
    private static String query(String q) {
        if(q.length()>100) throw new IllegalArgumentException("Search allows 100 characters");
        return "%"+q.trim().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
    }
    private static void paging(int page,int size) { if(page<0 || size<1 || size>100) throw new IllegalArgumentException("page must be nonnegative; size must be 1–100"); }
    @Transactional(readOnly=true)
    public CollectionPage list(String q,boolean favorites,int page,int size) {
        return list(q,favorites,page,size,null);
    }
    @Transactional(readOnly=true) public CollectionPage list(String q,boolean favorites,int page,int size,String parent) {
        paging(page,size);String where=" where lower(c.name) like ? escape '!'"+(favorites?" and c.favorite=1":"");var args=new ArrayList<Object>();args.add(query(q));
        if(parent!=null){if(parent.isEmpty())where+=" and c.parent_id is null";else{where+=" and c.parent_id=?";args.add(parent);}}
        long total=jdbc.queryForObject("select count(*) from collections c"+where,Long.class,args.toArray());args.add(size);args.add((long)page*size);
        var items=jdbc.query("select c.id,(select count(*) from resource_collections rc join resources r on r.id=rc.resource_id where r.trashed_at is null and rc.collection_id=c.id) from collections c"+where+" order by lower(c.name),c.id limit ? offset ?",(rs,n)->Map.entry(rs.getString(1),rs.getLong(2)),args.toArray());
        boolean exact=collections.findByNormalizedName(key(parent==null||parent.isEmpty()?null:parent,q.trim())).isPresent();
        return new CollectionPage(items.stream().map(e->dto(collections.findById(e.getKey()).orElseThrow(),e.getValue())).toList(),page,size,total,(int)((total+size-1)/size),exact);
    }
    private static String key(String parent,String display){return (parent==null?"":"\0"+parent+"\0")+display.trim().toLowerCase(Locale.ROOT);}
    private CollectionDto dto(ResourceCollection c,long count){
        var ancestors=new ArrayList<Ancestor>();String parent=c.getParentId();var seen=new HashSet<String>();
        while(parent!=null){if(!seen.add(parent)||seen.size()>32)throw new IllegalStateException("Invalid hierarchy");var p=collections.findById(parent).orElseThrow();ancestors.addFirst(new Ancestor(p.getId(),p.getName()));parent=p.getParentId();}
        return new CollectionDto(c.getId(),c.getName(),c.isFavorite(),count,c.getParentId(),ancestors,jdbc.queryForObject("select count(*) from collections where parent_id=?",Long.class,c.getId()));
    }
    private static void validateTree(Map<String,String> parents){
        for(String item:parents.keySet()){var seen=new HashSet<String>();String cursor=item;while(cursor!=null){if(!parents.containsKey(cursor)||!seen.add(cursor)||seen.size()>32)throw new IllegalArgumentException("Invalid collection hierarchy: missing parent, cycle or more than 32 levels");cursor=parents.get(cursor);}}
    }
    private void validateParent(String id,String parent){var parents=new HashMap<String,String>();for(var c:collections.findAll())parents.put(c.getId(),c.getParentId());parents.put(id,parent);validateTree(parents);}
    public record MoveInput(String parentId) {}
    @Transactional public CollectionDto move(String id,MoveInput input){
        var c=collections.findById(id).orElseThrow();validateParent(id,input.parentId());String normalized=key(input.parentId(),c.getName());
        var duplicate=collections.findByNormalizedName(normalized);if(duplicate.isPresent()&&!duplicate.get().getId().equals(id))throw new ResponseStatusException(HttpStatus.CONFLICT,"A sibling with this name already exists");
        c.setParentId(input.parentId());c.setNormalizedName(normalized);collections.saveAndFlush(c);return get(id);
    }
    @Transactional(readOnly=true)
    public PageDto<TagSummary> tags(String q,int page,int size) {
        paging(page,size);String pattern=query(q);
        long total=jdbc.queryForObject("select count(*) from tags where lower(name) like ? escape '!'",Long.class,pattern);
        var items=jdbc.query("select t.id,t.name,t.color,(select count(*) from resource_tags rt join resources active on active.id=rt.resource_id where active.trashed_at is null and rt.tag_id=t.id) from tags t where lower(t.name) like ? escape '!' order by t.name,t.id limit ? offset ?",(rs,n)->new TagSummary(rs.getString(1),rs.getString(2),rs.getString(3),rs.getLong(4)),pattern,size,(long)page*size);
        return new PageDto<>(items,page,size,total,(int)((total+size-1)/size));
    }
    @Transactional
    public CollectionDto save(String id,CollectionInput input) {
        var entity=id==null?new ResourceCollection():collections.findById(id).orElseThrow();
        String display=name(input.name()),normalized=key(entity.getParentId(),display);
        var existing=collections.findByNormalizedName(normalized);
        if(existing.isPresent() && !existing.get().getId().equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT,"A collection with this name already exists");
        entity.setName(display);entity.setNormalizedName(normalized);if(input.favorite()!=null)entity.setFavorite(input.favorite());
        collections.saveAndFlush(entity);
        long count=jdbc.queryForObject("select count(*) from resource_collections where resource_id in (select id from resources where trashed_at is null) and collection_id=?",Long.class,entity.getId());
        return dto(entity,count);
    }
    @Transactional public void delete(String id) {
        var plan=deletions.plan(id);
        deletions.apply(id,UUID.randomUUID().toString(),new CollectionDeletionService.Input(plan.fingerprint(),"keep",Map.of()));
    }
    @Transactional public void bulk(BulkInput input) {
        if(input.resourceIds()==null || input.resourceIds().isEmpty() || input.resourceIds().size()>100 || input.resourceIds().stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("Select 1–100 resource IDs");
        if(!List.of("add","remove").contains(input.action()==null?"":input.action())) throw new IllegalArgumentException("action must be add or remove");
        String table,column,parent;
        if("collection".equals(input.kind())) { table="resource_collections";column="collection_id";parent="collections"; }
        else if("tag".equals(input.kind())) { table="resource_tags";column="tag_id";parent="tags"; }
        else throw new IllegalArgumentException("kind must be collection or tag");
        if(jdbc.queryForObject("select count(*) from "+parent+" where id=?",Long.class,input.targetId())!=1) throw new NoSuchElementException("Organization target not found");
        var ids=new LinkedHashSet<>(input.resourceIds());
        for(String id:ids) if(jdbc.queryForObject("select count(*) from resources where id=? and trashed_at is null",Long.class,id)!=1) throw new NoSuchElementException("Resource not found: "+id);
        for(String id:ids) {
            if("add".equals(input.action())) jdbc.update("insert into "+table+" (resource_id,"+column+") select ?,? where not exists (select 1 from "+table+" where resource_id=? and "+column+"=?)",id,input.targetId(),id,input.targetId());
            else jdbc.update("delete from "+table+" where resource_id=? and "+column+"=?",id,input.targetId());
        }
    }
}
