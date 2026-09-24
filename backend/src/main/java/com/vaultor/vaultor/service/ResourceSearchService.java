package com.vaultor.vaultor.service;

import com.vaultor.vaultor.controller.ApiDtos.*;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/** Derived search data. SQLite triggers keep every resource mutation and its index in one transaction. */
@Service @RequiredArgsConstructor @DependsOn("entityManagerFactory") @Slf4j
public class ResourceSearchService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final WorkspaceGate gate;
    private final ResourceBrowseService browse;
    private final ExecutorService worker=Executors.newSingleThreadExecutor(Thread.ofPlatform().name("search-rebuild").factory());
    private final AtomicBoolean running=new AtomicBoolean();
    private volatile String failure="",requestId="";
    private volatile long processed=0;
    private static final Pattern TERMS=Pattern.compile("[\\p{L}\\p{N}_]+",Pattern.UNICODE_CHARACTER_CLASS);
    // Only visible text nodes and resource-link labels; never arbitrary document attributes.
    private static String body(String row) {
        return """
            case when %1$s.type='note' and json_valid(%1$s.content) then coalesce((
              with recursive nodes(value,path) as (
                select %1$s.content,'' union all
                select child.value,n.path||'/'||printf('%%08d',child.key)
                from nodes n,json_each(n.value,'$.content') child where child.type='object'
              ) select group_concat(piece,' ') from (
                select case when json_extract(value,'$.type')='text' then json_extract(value,'$.text')
                  when json_extract(value,'$.type')='resourceLink' then json_extract(value,'$.attrs.label') end as piece
                from nodes order by path
              )
            ),'') else '' end
            """.formatted(row);
    }
    @PostConstruct public void initialize() {
        try {
            transaction.executeWithoutResult(tx->{
            jdbc.execute("create virtual table if not exists resource_fts using fts5(id UNINDEXED,title,body,tokenize='unicode61 remove_diacritics 2')");
            for(String suffix:List.of("insert","update","delete"))jdbc.execute("drop trigger if exists resource_fts_"+suffix);
            jdbc.execute("create trigger if not exists resource_fts_insert after insert on resources begin insert into resource_fts(id,title,body) values(new.id,new.title,"+body("new")+"); end");
            jdbc.execute("create trigger if not exists resource_fts_update after update of title,content,type on resources begin delete from resource_fts where id=old.id; insert into resource_fts(id,title,body) values(new.id,new.title,"+body("new")+"); end");
            jdbc.execute("create trigger if not exists resource_fts_delete after delete on resources begin delete from resource_fts where id=old.id; end");
            });
            rebuild("startup");
        } catch(Exception e) {failure="Search initialization failed; rebuild after resolving the database error.";log.error("search_initialize_failed",e);}
    }
    @PreDestroy public void shutdown(){worker.shutdownNow();}
    public record Status(boolean rebuilding,long processed,long resources,long indexed,long invalidDocuments,boolean complete,String failure,String requestId) {}
    public Status status() {
        long total=jdbc.queryForObject("select count(*) from resources",Long.class),indexed=0;
        try {indexed=jdbc.queryForObject("select count(distinct id) from resource_fts where id in (select id from resources)",Long.class);} catch(Exception ignored) {}
        long invalid=jdbc.queryForObject("select count(*) from resources where type='note' and (content is null or not json_valid(content))",Long.class);
        return new Status(running.get(),processed,total,indexed,invalid,!running.get()&&failure.isEmpty()&&total==indexed&&invalid==0,failure,requestId);
    }
    public Status rebuild(String origin) {
        if(!running.compareAndSet(false,true))return status();
        requestId=origin;processed=0;failure="";
        worker.submit(()->{
            try {
                gate.exclusive(()->transaction.executeWithoutResult(tx->jdbc.update("delete from resource_fts")));
                String cursor="";
                while(!Thread.currentThread().isInterrupted()) {
                    final String after=cursor;var ids=new ArrayList<String>();
                    gate.exclusive(()->transaction.executeWithoutResult(tx->{
                        ids.addAll(jdbc.queryForList("select id from resources where id>? order by id limit 100",String.class,after));
                        for(String id:ids) {
                            jdbc.update("delete from resource_fts where id=?",id);
                            jdbc.update("insert into resource_fts(id,title,body) select r.id,r.title,"+body("r")+" from resources r where r.id=?",id);
                        }
                    }));
                    if(ids.isEmpty())break;
                    cursor=ids.getLast();processed+=ids.size();
                }
                if(Thread.currentThread().isInterrupted())throw new InterruptedException();
                log.info("search_rebuild_complete requestId={} processed={}",requestId,processed);
            }catch(Exception e){failure="Search rebuild failed; retry from Diagnostics.";log.error("search_rebuild_failed requestId={}",requestId,e);}
            finally {running.set(false);}
        });
        return status();
    }
    public record Highlight(int start,int end) {}
    public record Snippet(String text,List<Highlight> highlights) {}
    public record Hit(ResourceSummary resource,Snippet snippet) {}
    static Snippet snippet(String marked) {
        var text=new StringBuilder();var highlights=new ArrayList<Highlight>();int start=-1;
        for(char c:marked.toCharArray()) {if(c=='\ue000')start=text.length();else if(c=='\ue001'){if(start>=0)highlights.add(new Highlight(start,text.length()));start=-1;}else if(text.length()<600)text.append(c);}
        return new Snippet(text.toString(),highlights.stream().filter(h->h.end()>h.start()).toList());
    }
    @org.springframework.transaction.annotation.Transactional(readOnly=true)
    public PageDto<Hit> search(String q,int page,int size,String type,List<String> tags,String collection,boolean pins) {
        if(page<0||size<1||size>100||q.length()>500||tags.size()>100)throw new IllegalArgumentException("Search allows page>=0, size 1–100, 500 characters and 100 tags");
        if(running.get()||!failure.isEmpty())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Search index is rebuilding or unavailable. Check Diagnostics and retry.");
        var terms=TERMS.matcher(q);var words=new ArrayList<String>();while(terms.find()){if(words.size()==30)throw new IllegalArgumentException("Search allows at most 30 terms");words.add("\""+terms.group()+"\"*");}
        if(words.isEmpty())return new PageDto<>(List.of(),page,size,0,0);
        var args=new ArrayList<Object>();args.add(String.join(" AND ",words));
        StringBuilder where=new StringBuilder(" from resource_fts join resources r on r.id=resource_fts.id where resource_fts match ?");
        if(type!=null&&!type.isBlank()&&!type.equals("all")){if(!List.of("note","file").contains(type))throw new IllegalArgumentException("Unknown resource type");where.append(" and r.type=?");args.add(type);}
        if(pins)where.append(" and coalesce(r.favorite,0)=1");
        if(collection!=null&&!collection.isBlank()){where.append(" and exists(select 1 from resource_collections rc where rc.resource_id=r.id and rc.collection_id=?)");args.add(collection);}
        for(String tag:tags.stream().distinct().toList()){where.append(" and exists(select 1 from resource_tags rt join tags t on t.id=rt.tag_id where rt.resource_id=r.id and t.name=?)");args.add(tag.trim().toLowerCase(Locale.ROOT));}
        long total=jdbc.queryForObject("select count(*)"+where,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        record Match(String id,String marked){}
        var matches=jdbc.query("select r.id,snippet(resource_fts,2,char(57344),char(57345),' … ',40)"+where+" order by bm25(resource_fts,0,10,1),lower(r.title),r.id limit ? offset ?",(rs,n)->new Match(rs.getString(1),rs.getString(2)),args.toArray());
        var summaries=browse.byIds(matches.stream().map(Match::id).toList());
        return new PageDto<>(matches.stream().filter(m->summaries.containsKey(m.id())).map(m->new Hit(summaries.get(m.id()),snippet(m.marked()))).toList(),page,size,total,(int)((total+size-1)/size));
    }
}
