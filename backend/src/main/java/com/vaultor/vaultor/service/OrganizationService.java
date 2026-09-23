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
    private final CollectionRepository collections;
    private final JdbcTemplate jdbc;
    public record CollectionDto(String id,String name,boolean favorite,long count) {}
    public record TagSummary(String id,String name,String color,long count) {}
    public record CollectionData(String id,String name,boolean favorite,List<String> resources) {}
    public record OrganizationData(List<CollectionData> collections,List<String> favorites) {}
    public OrganizationData snapshot() {
        Map<String,List<String>> members=new HashMap<>();
        jdbc.query("select collection_id,resource_id from resource_collections order by resource_id",(org.springframework.jdbc.core.RowCallbackHandler)rs -> members.computeIfAbsent(rs.getString(1),k->new ArrayList<>()).add(rs.getString(2)));
        return new OrganizationData(collections.findAll().stream().map(c->new CollectionData(c.getId(),c.getName(),c.isFavorite(),members.getOrDefault(c.getId(),List.of()))).toList(),jdbc.queryForList("select id from resources where favorite=1 order by id",String.class));
    }
    public static void validate(OrganizationData data,Set<String> resourceIds) {
        if(data==null || data.collections()==null || data.favorites()==null || !resourceIds.containsAll(data.favorites())) throw new IllegalArgumentException("Invalid organization or favorite references");
        Set<String> ids=new HashSet<>(),names=new HashSet<>();
        for(var c:data.collections()) {
            if(c==null || c.id()==null || !c.id().matches("[a-zA-Z0-9-]{1,80}") || !ids.add(c.id()) || !names.add(name(c.name()).toLowerCase(Locale.ROOT)) || c.resources()==null || !resourceIds.containsAll(c.resources()) || new HashSet<>(c.resources()).size()!=c.resources().size()) throw new IllegalArgumentException("Invalid collection or membership references");
        }
    }
    public void clear() { jdbc.update("delete from resource_collections"); collections.deleteAll();collections.flush(); }
    public void restore(OrganizationData data,Map<String,String> ids,boolean merge) {
        for(var c:data.collections()) {
            String normalized=name(c.name()).toLowerCase(Locale.ROOT);
            var existing=collections.findByNormalizedName(normalized);
            var entity=existing.orElseGet(ResourceCollection::new);
            if(existing.isEmpty()) { if(!merge)entity.setId(c.id());entity.setName(name(c.name()));entity.setNormalizedName(normalized);entity.setFavorite(c.favorite());collections.saveAndFlush(entity); }
            for(String id:c.resources()) jdbc.update("insert into resource_collections(resource_id,collection_id) values(?,?)",ids.get(id),entity.getId());
        }
        for(String id:data.favorites()) jdbc.update("update resources set favorite=1 where id=?",ids.get(id));
    }
    public record CollectionInput(String name,Boolean favorite) {}
    public record BulkInput(List<String> resourceIds,String kind,String targetId,String action) {}
    public static String name(String value) {
        if(value==null || value.isBlank() || value.trim().length()>100) throw new IllegalArgumentException("Name must contain 1–100 characters");
        return value.trim();
    }
    private static String query(String q) {
        if(q.length()>100) throw new IllegalArgumentException("Search allows 100 characters");
        return "%"+q.trim().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
    }
    private static void paging(int page,int size) { if(page<0 || size<1 || size>100) throw new IllegalArgumentException("page must be nonnegative; size must be 1–100"); }
    @Transactional(readOnly=true)
    public PageDto<CollectionDto> list(String q,boolean favorites,int page,int size) {
        paging(page,size);String where=" where lower(c.name) like ? escape '!'"+(favorites?" and c.favorite=1":"");String pattern=query(q);
        long total=jdbc.queryForObject("select count(*) from collections c"+where,Long.class,pattern);
        var items=jdbc.query("select c.id,c.name,c.favorite,(select count(*) from resource_collections rc where rc.collection_id=c.id) as members from collections c"+where+" order by c.normalized_name,c.id limit ? offset ?",(rs,n)->new CollectionDto(rs.getString(1),rs.getString(2),rs.getBoolean(3),rs.getLong(4)),pattern,size,(long)page*size);
        return new PageDto<>(items,page,size,total,(int)((total+size-1)/size));
    }
    @Transactional(readOnly=true)
    public PageDto<TagSummary> tags(String q,int page,int size) {
        paging(page,size);String pattern=query(q);
        long total=jdbc.queryForObject("select count(*) from tags where lower(name) like ? escape '!'",Long.class,pattern);
        var items=jdbc.query("select t.id,t.name,t.color,(select count(*) from resource_tags rt where rt.tag_id=t.id) from tags t where lower(t.name) like ? escape '!' order by t.name,t.id limit ? offset ?",(rs,n)->new TagSummary(rs.getString(1),rs.getString(2),rs.getString(3),rs.getLong(4)),pattern,size,(long)page*size);
        return new PageDto<>(items,page,size,total,(int)((total+size-1)/size));
    }
    @Transactional
    public CollectionDto save(String id,CollectionInput input) {
        String display=name(input.name()),normalized=display.toLowerCase(Locale.ROOT);
        var existing=collections.findByNormalizedName(normalized);
        if(existing.isPresent() && !existing.get().getId().equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT,"A collection with this name already exists");
        var entity=id==null?new ResourceCollection():collections.findById(id).orElseThrow();
        entity.setName(display);entity.setNormalizedName(normalized);if(input.favorite()!=null)entity.setFavorite(input.favorite());
        collections.saveAndFlush(entity);
        long count=jdbc.queryForObject("select count(*) from resource_collections where collection_id=?",Long.class,entity.getId());
        return new CollectionDto(entity.getId(),entity.getName(),entity.isFavorite(),count);
    }
    @Transactional public void delete(String id) {
        var entity=collections.findById(id).orElseThrow();
        jdbc.update("delete from resource_collections where collection_id=?",id);collections.delete(entity);
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
        for(String id:ids) if(jdbc.queryForObject("select count(*) from resources where id=?",Long.class,id)!=1) throw new NoSuchElementException("Resource not found: "+id);
        for(String id:ids) {
            if("add".equals(input.action())) jdbc.update("insert into "+table+" (resource_id,"+column+") select ?,? where not exists (select 1 from "+table+" where resource_id=? and "+column+"=?)",id,input.targetId(),id,input.targetId());
            else jdbc.update("delete from "+table+" where resource_id=? and "+column+"=?",id,input.targetId());
        }
    }
}
