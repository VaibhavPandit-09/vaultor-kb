package com.vaultor.vaultor.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Saved references only. Paging selects metadata and bounded occurrences, never note bodies. */
@Service @RequiredArgsConstructor
public class ResourceReferences {
    private final JdbcTemplate jdbc;
    public record Occurrence(String path,String kind,String label) {}
    public record Entry(String id,String title,String type,String mimeType,boolean available,boolean trashed,String revision,long noteLinks,long fileLinks,long images,long otherLinks,List<Occurrence> occurrences) {}
    public record Page(List<Entry> items,int page,int size,long totalItems,int totalPages,long totalOccurrences,String sourceRevision) {}
    @Transactional(readOnly=true)
    public Page list(String id,String direction,int page,int size) {
        var revisions=jdbc.query("select revision_seed,revision_number from resources where id=?",(rs,n)->UUID.nameUUIDFromBytes((id+":"+rs.getString(1)+":"+rs.getLong(2)).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(),id);
        if(revisions.isEmpty())throw new NoSuchElementException("Resource not found");
        if(!Set.of("incoming","outgoing").contains(direction)||page<0||size<1||size>100)throw new IllegalArgumentException("Choose incoming/outgoing, page>=0 and size 1–100");
        boolean incoming=direction.equals("incoming");
        String candidates=incoming?"r.trashed_at is null and exists(select 1 from relationships link where link.from_id=r.id and link.to_id=? and link.type='link')":"r.id=?";
        String cte="""
          with recursive nodes(source_id,value,path) as (
            select r.id,r.content,'' from resources r where r.type='note' and json_valid(r.content) and %s
            union all select n.source_id,child.value,n.path||'/'||child.key from nodes n,json_each(n.value,'$.content') child where child.type='object'
          ), refs as (
            select source_id,json_extract(value,'$.attrs.resourceId') target_id,path,
              case when json_extract(value,'$.type')='image' then 'image'
                when json_extract(value,'$.attrs.type')='note' then 'note-link'
                when json_extract(value,'$.attrs.type')='file' then 'file-link' else 'resource-link' end kind,
              coalesce(json_extract(value,'$.attrs.label'),nullif(json_extract(value,'$.attrs.caption'),''),json_extract(value,'$.attrs.alt'),'') label
            from nodes where json_extract(value,'$.type') in ('image','resourceLink') and json_extract(value,'$.attrs.resourceId') is not null
          )
          """.formatted(candidates);
        String key=incoming?"source_id":"target_id",condition=incoming?" where target_id=?":"";
        var args=new ArrayList<Object>();args.add(id);if(incoming)args.add(id);
        long total=jdbc.queryForObject(cte+"select count(distinct "+key+") from refs"+condition,Long.class,args.toArray());
        long occurrences=jdbc.queryForObject(cte+"select count(*) from refs"+condition,Long.class,args.toArray());
        var paged=new ArrayList<>(args);paged.add(size);paged.add((long)page*size);
        String aggregate="select "+key+" id,coalesce(min(nullif(label,'')),'') fallback,sum(kind='note-link') notes,sum(kind='file-link') files,sum(kind='image') images,sum(kind='resource-link') others from refs"+condition+" group by "+key;
        var items=jdbc.query(cte+"select grouped.*,r.title,r.type,r.mime_type,r.trashed_at,r.revision_seed,r.revision_number from ("+aggregate+") grouped left join resources r on r.id=grouped.id order by lower(coalesce(r.title,grouped.fallback)),grouped.id limit ? offset ?",(rs,n)->new Entry(rs.getString("id"),rs.getString("title")==null?(rs.getString("fallback").isBlank()?"Unavailable resource":rs.getString("fallback")):(rs.getString("title").isBlank()?"Untitled note":rs.getString("title")),rs.getString("type")==null?"unknown":rs.getString("type"),rs.getString("mime_type"),rs.getString("type")!=null&&rs.getTimestamp("trashed_at")==null,rs.getTimestamp("trashed_at")!=null,rs.getString("type")==null?null:UUID.nameUUIDFromBytes((rs.getString("id")+":"+rs.getString("revision_seed")+":"+rs.getLong("revision_number")).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(),rs.getLong("notes"),rs.getLong("files"),rs.getLong("images"),rs.getLong("others"),new ArrayList<>()),paged.toArray());
        for(var item:items) {
            var selected=new ArrayList<>(args);selected.add(item.id());
            item.occurrences().addAll(jdbc.query(cte+"select path,kind,label from refs"+condition+(incoming?" and ":" where ")+key+"=? order by path limit 20",(rs,n)->new Occurrence(rs.getString(1),rs.getString(2),rs.getString(3)),selected.toArray()));
        }
        return new Page(items,page,size,total,(int)((total+size-1)/size),occurrences,revisions.getFirst());
    }
}
