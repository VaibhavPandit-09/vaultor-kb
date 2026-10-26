package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.CollectionDeletion;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.util.*;

/** One SQLite transaction owns the snapshot, lifecycle mutations and durable retry receipt. */
@Service @RequiredArgsConstructor
public class CollectionDeletionService {
    private final JdbcTemplate jdbc;
    private final EntityManager entities;
    private final ObjectMapper mapper;
    private final ResourceLifecycleService lifecycle;
    private final ChangeFeed changes;
    private final WorkspaceIdentityService identity;
    public record Node(String id,String parentId,String name) {}
    public record Target(String id,String title,String type) {}
    public record Plan(String fingerprint,List<Node> collections,long managedResources,long sharedResources,
                       long linkedReferences,long referringNotes,List<Target> exclusiveResources) {}
    public record Input(String fingerprint,String mode,Map<String,String> revisions) {}
    public record Result(List<String> deletedCollectionIds,String parentId,List<String> trashedResourceIds) {}
    private record Member(String resourceId,String collectionId,String type,boolean trashed,boolean pending,String title) {}

    @Transactional(readOnly=true) public Plan plan(String id) {
        var nodes=jdbc.query("with recursive subtree(id,parent_id,name,depth) as (select id,parent_id,name,1 from collections where id=? union all select c.id,c.parent_id,c.name,s.depth+1 from collections c join subtree s on c.parent_id=s.id where s.depth<=32) select id,parent_id,name,depth from subtree order by depth,id",(rs,n)->{
            if(rs.getInt(4)>32)throw new IllegalArgumentException("Collection hierarchy exceeds 32 levels");
            return new Node(rs.getString(1),rs.getString(2),rs.getString(3));
        },id);
        if(nodes.isEmpty())throw new NoSuchElementException("Collection not found");
        var ids=new HashSet<>(nodes.stream().map(Node::id).toList());
        // Read only memberships touching the subtree, including every outside membership of those resources.
        var members=jdbc.query("with recursive subtree(id) as (select id from collections where id=? union select c.id from collections c join subtree s on c.parent_id=s.id), affected(id) as (select distinct resource_id from resource_collections where collection_id in (select id from subtree)) select rc.resource_id,rc.collection_id,r.type,r.trashed_at,r.purge_pending,r.title from resource_collections rc join resources r on r.id=rc.resource_id where rc.resource_id in (select id from affected) order by rc.resource_id,rc.collection_id",(rs,n)->new Member(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4)!=null,rs.getBoolean(5),rs.getString(6)),id);
        var managed=new TreeSet<String>();var shared=new HashSet<String>();var linked=new HashSet<String>();var active=new TreeMap<String,Target>();
        for(var m:members) {
            if(m.type().equals("linked")){linked.add(m.resourceId());continue;}
            if(!Set.of("note","file").contains(m.type()))throw new IllegalArgumentException("Unsupported resource kind in collection");
            if(m.pending())throw new ResponseStatusException(HttpStatus.CONFLICT,"Finish pending resource cleanup before deleting this hierarchy");
            managed.add(m.resourceId());if(!m.trashed())active.put(m.resourceId(),new Target(m.resourceId(),m.title(),m.type()));if(!ids.contains(m.collectionId()))shared.add(m.resourceId());
        }
        var exclusive=active.values().stream().filter(t->!shared.contains(t.id())).toList();
        var referring=lifecycle.referencingSources(exclusive.stream().map(Target::id).toList());
        referring.removeAll(exclusive.stream().map(Target::id).toList());
        String fingerprint;
        try {fingerprint=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(List.of(identity.current().generation(),id,nodes,members.stream().map(m->List.of(m.resourceId(),m.collectionId(),m.type(),m.trashed(),m.pending())).toList()))));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        return new Plan(fingerprint,nodes,managed.size(),shared.size(),linked.size(),referring.size(),exclusive);
    }

    @Transactional public Result apply(String id,String operationId,Input input) {
        UUID.fromString(operationId);
        if(input==null||input.mode()==null||!Set.of("keep","trash-exclusive").contains(input.mode())||input.fingerprint()==null||input.revisions()==null)throw new IllegalArgumentException("Provide the reviewed deletion plan and mode");
        String serialized=mapper.writeValueAsString(List.of(identity.current().generation(),id,new Input(input.fingerprint(),input.mode(),new TreeMap<>(input.revisions()))));
        var receipt=entities.find(CollectionDeletion.class,operationId);
        if(receipt!=null){if(!receipt.getInput().equals(serialized))throw new ResponseStatusException(HttpStatus.CONFLICT,"Deletion identity was used for different input");return mapper.readValue(receipt.getResult(),Result.class);}
        var current=plan(id);
        if(!current.fingerprint().equals(input.fingerprint()))throw new ResponseStatusException(HttpStatus.CONFLICT,"The hierarchy or memberships changed. Reopen deletion to review the current counts.");
        var trashed=new ArrayList<String>();
        if(input.mode().equals("trash-exclusive")) {
            if(!input.revisions().keySet().equals(new HashSet<>(current.exclusiveResources().stream().map(Target::id).toList())))throw new IllegalArgumentException("Provide current revisions for exactly the exclusive resources");
            for(var target:current.exclusiveResources()) {
                String itemId=UUID.randomUUID().toString(); // The outer receipt owns retries; rolled-back item IDs never survive.
                var result=lifecycle.apply(new ResourceLifecycleService.Item(itemId,target.id(),"trash",input.revisions().get(target.id())));
                if(!result.status().equals("trashed"))throw new IllegalStateException("Resource did not reach Trash");
                trashed.add(target.id());
            }
        }
        entities.flush();
        for(var node:current.collections())jdbc.update("delete from resource_collections where collection_id=?",node.id());
        var reverse=new ArrayList<>(current.collections());Collections.reverse(reverse);
        for(var node:reverse)jdbc.update("delete from collections where id=?",node.id());
        // Lifecycle hydrated membership sets must not outlive their deleted collection entities.
        entities.clear();
        var result=new Result(current.collections().stream().map(Node::id).toList(),current.collections().getFirst().parentId(),trashed);
        var op=new CollectionDeletion();op.setId(operationId);op.setInput(serialized);op.setResult(mapper.writeValueAsString(result));entities.persist(op);entities.flush();
        changes.committed("organization",result.deletedCollectionIds(),org.slf4j.MDC.get("requestId"));
        return result;
    }
}
