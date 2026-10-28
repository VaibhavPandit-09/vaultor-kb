package com.vaultor.vaultor.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** Snapshot freezes IDs/revisions, not a filter or a moving page of Trash.
 * Per-item durable lifecycle receipts cover a crash between cleanup and checkpoint. */
@Service @RequiredArgsConstructor
public class TrashPurgeService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final WorkspaceIdentityService identity;
    private final ResourceLifecycleService lifecycle;
    private final ObjectMapper json;
    public record Snapshot(String id,String generation,List<ResourceLifecycleService.Item> items,boolean confirmed,long sources,List<ResourceLifecycleService.Result> results) {}
    public record Status(String id,String generation,int total,int done,int pending,long sources,boolean confirmed,List<ResourceLifecycleService.Result> failures) {}
    public record Confirmation(String generation,int count) {}
    private Snapshot read(String id){return transaction.execute(tx->{UUID.fromString(id);var rows=jdbc.queryForList("select receipt from trash_purges where id=?",String.class,id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Trash snapshot not found");var saved=json.readValue(rows.getFirst(),Snapshot.class);if(!saved.generation().equals(identity.current().generation()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Trash snapshot belongs to an earlier workspace generation");return saved;});}
    private void save(Snapshot value){transaction.executeWithoutResult(tx->jdbc.update("update trash_purges set receipt=? where id=?",json.writeValueAsString(value),value.id()));}
    public synchronized Status preview(String id){
        UUID.fromString(id);
        return transaction.execute(tx->{
            if(jdbc.queryForObject("select count(*) from trash_purges where id=?",Integer.class,id)>0)return status(read(id));
            if(jdbc.queryForObject("select count(*) from trash_purges",Integer.class)>=128)throw new ResponseStatusException(HttpStatus.CONFLICT,"Trash snapshot retention limit reached; retained receipts were kept");
            // Metadata only, including exact revision seed. No documents or original bytes.
            var items=jdbc.query("select id,revision_seed,revision_number,purge_pending from resources where trashed_at is not null order by id limit 20001",(row,n)->{
                String resource=row.getString("id");
                if(row.getBoolean("purge_pending"))return lifecycle.pending(resource);
                String revision=UUID.nameUUIDFromBytes((resource+":"+row.getString("revision_seed")+":"+row.getLong("revision_number")).getBytes(StandardCharsets.UTF_8)).toString();
                return new ResourceLifecycleService.Item(UUID.randomUUID().toString(),resource,"purge",revision);
            });
            if(items.size()>20000)throw new ResponseStatusException(HttpStatus.CONFLICT,"Empty Trash supports up to 20,000 resources per reviewed snapshot");
            var saved=new Snapshot(id,identity.current().generation(),items,false,lifecycle.referencingSources(items.stream().map(ResourceLifecycleService.Item::resourceId).toList()).size(),List.of());
            jdbc.update("insert into trash_purges(id,receipt) values(?,?)",id,json.writeValueAsString(saved));return status(saved);
        });
    }
    public synchronized Status get(String id){return status(read(id));}
    public synchronized void cancelPreview(String id){transaction.executeWithoutResult(tx->{UUID.fromString(id);if(jdbc.queryForObject("select count(*) from trash_purges where id=?",Integer.class,id)==0)return;var saved=read(id);if(saved.confirmed())throw new ResponseStatusException(HttpStatus.CONFLICT,"Confirmed Trash receipts must be retained for safe retries");jdbc.update("delete from trash_purges where id=?",id);});}
    public synchronized Status confirm(String id,Confirmation input){
        var saved=read(id);
        if(input==null||!Objects.equals(input.generation(),saved.generation())||input.count()!=saved.items().size())throw new ResponseStatusException(HttpStatus.CONFLICT,"Review the exact Trash snapshot before confirming");
        if(!saved.confirmed()){saved=new Snapshot(saved.id(),saved.generation(),saved.items(),true,saved.sources(),saved.results());save(saved);}return status(saved);
    }
    public synchronized Status step(String id){
        var saved=read(id);if(!saved.confirmed())throw new ResponseStatusException(HttpStatus.CONFLICT,"Confirm permanent deletion before processing Trash");
        var results=new LinkedHashMap<String,ResourceLifecycleService.Result>();saved.results().forEach(value->results.put(value.resourceId(),value));
        var pending=saved.items().stream().filter(item->!results.containsKey(item.resourceId())||!results.get(item.resourceId()).status().equals("purged")).limit(50).toList();
        if(!pending.isEmpty())lifecycle.bulk(pending).forEach(value->results.put(value.resourceId(),value));
        var next=new Snapshot(saved.id(),saved.generation(),saved.items(),true,saved.sources(),new ArrayList<>(results.values()));save(next);return status(next);
    }
    private Status status(Snapshot saved){int done=(int)saved.results().stream().filter(value->value.status().equals("purged")).count();return new Status(saved.id(),saved.generation(),saved.items().size(),done,saved.items().size()-done,saved.sources(),saved.confirmed(),saved.results().stream().filter(value->!value.status().equals("purged")).toList());}
}
