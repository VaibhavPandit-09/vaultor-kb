package com.vaultor.vaultor.service;

import com.vaultor.vaultor.controller.ApiDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.*;

/** Browsing deliberately selects metadata only; never hydrate resource content or binaries. */
@Service @RequiredArgsConstructor
public class ResourceBrowseService {
    private final JdbcTemplate jdbc;
    private static LocalDateTime date(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column); return value == null ? null : value.toLocalDateTime();
    }
    @Transactional(readOnly = true)
    public PageDto<ResourceSummary> list(int page, int size, String q, String type, List<String> tags, boolean favorites, String sort) {
        return list(page,size,q,type,tags,favorites,sort,null);
    }
    @Transactional(readOnly = true)
    public PageDto<ResourceSummary> list(int page,int size,String q,String type,List<String> tags,boolean favorites,String sort,String collection) {
        return list(page,size,q,type,tags,favorites,sort,collection,null);
    }
    public Map<String,ResourceSummary> byIds(List<String> ids) {
        if(ids.isEmpty())return Map.of();
        var result=new HashMap<String,ResourceSummary>();list(0,200,"",null,List.of(),false,"title",null,ids).items().forEach(r->result.put(r.id(),r));return result;
    }
    private PageDto<ResourceSummary> list(int page,int size,String q,String type,List<String> tags,boolean favorites,String sort,String collection,List<String> ids) {
        if (page < 0 || size < 1 || size > 200) throw new IllegalArgumentException("page must be nonnegative; size must be 1-200");
        if (q.length() > 500 || tags.size() > 100) throw new IllegalArgumentException("Search allows 500 characters and 100 tags");
        String order = switch (sort) {
            case "title" -> "lower(r.title) asc,r.id asc";
            case "updated" -> "r.updated_at desc,r.id asc";
            case "recent" -> "r.last_opened_at desc,r.updated_at desc,r.id asc";
            default -> throw new IllegalArgumentException("sort must be title, updated or recent");
        };
        var args = new ArrayList<Object>();
        StringBuilder where = new StringBuilder(" where 1=1");
        if(ids!=null){where.append(" and r.id in ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")");args.addAll(ids);}
        if (!q.isBlank()) { where.append(" and lower(r.title) like ? escape '!'"); args.add("%" + q.trim().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"); }
        if (type != null && !type.isBlank() && !type.equals("all")) { where.append(" and r.type=?"); args.add(type); }
        if (collection != null && !collection.isBlank()) { where.append(" and exists (select 1 from resource_collections rc where rc.resource_id=r.id and rc.collection_id=?)"); args.add(collection); }
        if (favorites) where.append(" and coalesce(r.favorite,0)=1");
        for (String tag : tags.stream().map(t -> t.trim().toLowerCase(Locale.ROOT)).distinct().toList()) {
            where.append(" and exists (select 1 from resource_tags rt join tags t on t.id=rt.tag_id where rt.resource_id=r.id and lower(t.name)=?)"); args.add(tag);
        }
        long total = Objects.requireNonNull(jdbc.queryForObject("select count(*) from resources r" + where, Long.class, args.toArray()));
        args.add(size); args.add((long)page * size);
        var items = jdbc.query("select r.id,r.type,r.title,r.mime_type,r.size,r.created_at,r.updated_at,r.last_opened_at,r.favorite from resources r" + where + " order by " + order + " limit ? offset ?",
            (rs, n) -> new ResourceSummary(rs.getString("id"),rs.getString("type"),rs.getString("title"),rs.getString("mime_type"),rs.getObject("size") == null ? null : rs.getLong("size"),date(rs,"created_at"),date(rs,"updated_at"),date(rs,"last_opened_at"),new ArrayList<>(),rs.getBoolean("favorite"),new ArrayList<>()), args.toArray());
        if (!items.isEmpty()) {
            var byId = new HashMap<String,ResourceSummary>(); items.forEach(item -> byId.put(item.id(),item));
            String placeholders = String.join(",", Collections.nCopies(items.size(), "?"));
            jdbc.query("select rt.resource_id,t.id,t.name,t.color from resource_tags rt join tags t on t.id=rt.tag_id where rt.resource_id in (" + placeholders + ") order by t.name,t.id", rs -> {
                byId.get(rs.getString("resource_id")).tags().add(new TagDto(rs.getString("id"),rs.getString("name"),rs.getString("color")));
            }, items.stream().map(ResourceSummary::id).toArray());
            jdbc.query("select rc.resource_id,c.id,c.name from resource_collections rc join collections c on c.id=rc.collection_id where rc.resource_id in (" + placeholders + ") order by c.normalized_name,c.id", rs -> { byId.get(rs.getString(1)).collections().add(new CollectionRef(rs.getString(2),rs.getString(3))); }, items.stream().map(ResourceSummary::id).toArray());
        }
        return new PageDto<>(items,page,size,total,(int)((total+size-1)/size));
    }
    @Transactional
    public void markOpened(String id) {
        if (jdbc.update("update resources set last_opened_at=? where id=?", java.sql.Timestamp.valueOf(LocalDateTime.now()), id) != 1) throw new NoSuchElementException("Resource not found");
    }
    @Transactional
    public void favorite(String id, Boolean value) {
        if (value == null) throw new IllegalArgumentException("favorite is required");
        if (jdbc.update("update resources set favorite=? where id=?", value, id) != 1) throw new NoSuchElementException("Resource not found");
    }
}
