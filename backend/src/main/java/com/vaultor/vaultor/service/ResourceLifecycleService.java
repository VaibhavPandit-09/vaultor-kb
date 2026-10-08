package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.*;
import com.vaultor.vaultor.repository.*;
import com.vaultor.vaultor.controller.ApiDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.*;

/** Durable per-item identities. Binary cleanup starts only after irreversible intent is committed. */
@Service @RequiredArgsConstructor
public class ResourceLifecycleService {
    private final ResourceRepository resources;
    private final LifecycleRequestRepository requests;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final RelationshipService links;
    private final FileStorageService files;
    private final TransactionTemplate transaction;
    private final ObjectMapper mapper;
    private final ChangeFeed changes;
    public record Item(String operationId,String resourceId,String action,String revision) {}
    public record Result(String operationId,String resourceId,String status,String revision,String detail,List<String> warnings) {}
    public record Usage(long sources) {}
    public Item pending(String id) {var op=requests.findByResourceIdAndStatus(id,"cleanup-pending").stream().findFirst().orElseThrow();return new Item(op.getId(),id,"purge",op.getExpectedRevision());}
    @org.springframework.transaction.annotation.Transactional(readOnly=true)
    public Usage usage(String id) {
        resources.findById(id).orElseThrow();
        return new Usage(jdbc.queryForObject("select count(distinct link.from_id) from relationships link join resources source on source.id=link.from_id where link.to_id=? and link.type='link' and source.trashed_at is null",Long.class,id));
    }
    public Result apply(Item item) {
        if(item==null||item.resourceId()==null||!Set.of("trash","restore","purge").contains(item.action()))throw new IllegalArgumentException("Choose trash, restore or purge");
        UUID.fromString(item.operationId());
        Result staged=transaction.execute(tx->{
            var previous=requests.findById(item.operationId());
            if(previous.isPresent()) {
                var op=previous.get();
                if(!Objects.equals(op.getResourceId(),item.resourceId())||!Objects.equals(op.getAction(),item.action())||!Objects.equals(op.getExpectedRevision(),item.revision()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Operation identity was used for different input");
                return mapper.readValue(op.getResult(),Result.class);
            }
            var resource=resources.findById(item.resourceId()).orElseThrow();
            if(item.revision()==null||item.revision().isBlank())throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,"Resource revision is required");
            if(!item.revision().equals(resource.getRevision()))throw new com.vaultor.vaultor.controller.ApiErrors.RevisionConflict();
            if(Boolean.TRUE.equals(resource.getPurgePending()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Permanent deletion is awaiting cleanup; retry its existing operation");
            var warnings=new ArrayList<String>();
            if(item.action().equals("trash")&&resource.getTrashedAt()==null) {
                resource.setTrashOrganization(mapper.writeValueAsString(organizationNames(resource)));
                resource.setTrashedAt(LocalDateTime.now());
            } else if(item.action().equals("restore")) {
                if(resource.getTrashOrganization()!=null)for(var name:mapper.readTree(resource.getTrashOrganization()))if(!organizationNames(resource).contains(name.asText()))warnings.add("No longer available: "+name.asText());
                resource.setTrashedAt(null);resource.setTrashOrganization(null);
            } else if(item.action().equals("purge")) {
                if(resource.getTrashedAt()==null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Move this resource to Trash first");
                resource.setPurgePending(true);
            }
            resources.saveAndFlush(resource);
            String status=item.action().equals("purge")?"cleanup-pending":item.action().equals("trash")?"trashed":"restored";
            var result=new Result(item.operationId(),resource.getId(),status,resource.getRevision(),status.equals("cleanup-pending")?"Permanent deletion started. Retry this operation if cleanup fails.":"",warnings);
            var op=new LifecycleRequest();op.setId(item.operationId());op.setResourceId(item.resourceId());op.setAction(item.action());op.setExpectedRevision(item.revision());op.setStatus(status);op.setResult(mapper.writeValueAsString(result));requests.saveAndFlush(op);
            changes.committed("resources",List.of(resource.getId()),org.slf4j.MDC.get("requestId"));return result;
        });
        if(!staged.status().equals("cleanup-pending"))return staged;
        // Retry uses the same durable identity, including after restart. Never restore a partially purged original.
        try {
            String binary=transaction.execute(tx->resources.findById(item.resourceId()).map(Resource::getFilePath).orElse(null));
            if(binary!=null)files.deleteFile(binary);
            return transaction.execute(tx->{
                resources.findById(item.resourceId()).ifPresent(r->{links.deleteRelationshipsFor(r.getId());resources.delete(r);resources.flush();});
                var result=new Result(item.operationId(),item.resourceId(),"purged",null,"",List.of());
                var op=requests.findById(item.operationId()).orElseThrow();op.setStatus("purged");op.setResult(mapper.writeValueAsString(result));requests.save(op);
                changes.committed("resources",List.of(item.resourceId()),org.slf4j.MDC.get("requestId"));return result;
            });
        } catch(Exception e) {return new Result(staged.operationId(),staged.resourceId(),"cleanup-pending",staged.revision(),"File cleanup did not finish. Retry permanent deletion; the resource stays unavailable.",List.of());}
    }
    private List<String> organizationNames(Resource r) {
        var names=new ArrayList<String>();r.getTags().forEach(t->names.add("Tag: "+t.getName()));r.getCollections().forEach(c->names.add("Collection: "+c.getName()));return names;
    }
    public List<Result> bulk(List<Item> items) {
        if(items==null||items.isEmpty()||items.size()>100||items.stream().anyMatch(Objects::isNull))throw new IllegalArgumentException("Provide 1–100 lifecycle items");
        var result=new ArrayList<Result>();
        for(var item:items)try {result.add(apply(item));}catch(Exception e){
            String detail=e instanceof com.vaultor.vaultor.controller.ApiErrors.RevisionConflict || e instanceof org.springframework.dao.OptimisticLockingFailureException?"This resource changed. Close and reopen the action to review the latest revision.":e instanceof ResponseStatusException status?status.getReason():e instanceof NoSuchElementException?"Resource or pending operation not found.":e instanceof IllegalArgumentException?"Invalid lifecycle input. Check the action, identity and revision.":"The lifecycle operation failed. Retry with the same identity; no success is claimed.";
            result.add(new Result(item.operationId(),item.resourceId(),"failed",null,detail,List.of()));
        }
        return result;
    }
}
