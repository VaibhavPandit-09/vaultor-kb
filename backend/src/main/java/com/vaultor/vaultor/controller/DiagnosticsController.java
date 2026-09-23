package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.repository.*;
import com.vaultor.vaultor.service.*;
import org.springframework.web.bind.annotation.*;
import org.slf4j.MDC;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.nio.file.Files;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api") @RequiredArgsConstructor @Slf4j
public class DiagnosticsController {
    private final ResourceRepository resources;
    private final RelationshipRepository relationships;
    private final FileStorageService files;
    private final DocumentService documents;
    private final LinkExtractionService links;
    private final WorkspaceGate gate;
    private final Deque<Event> events = new ArrayDeque<>();
    @GetMapping(value="/openapi.json", produces="application/json")
    public org.springframework.core.io.Resource openapi() { return new org.springframework.core.io.ClassPathResource("openapi.json"); }
    public record Event(String id, String timestamp, String action, String route, String message, String stack, String requestId, String build) {}
    @PostMapping("/diagnostics/events") public synchronized void collect(@RequestBody List<Event> incoming) {
        if(incoming.size()>20) throw new IllegalArgumentException("At most 20 diagnostic events per batch");
        for(var e:incoming) {
            if(e==null) throw new IllegalArgumentException("Diagnostic events must be objects");
            var safe=new Event(cut(e.id(),80),Instant.now().toString(),cut(e.action(),120),cut(e.route(),200),cut(e.message(),1000),cut(e.stack(),6000),cut(e.requestId(),80),cut(e.build(),80));
            events.addLast(safe); while(events.size()>200) events.removeFirst();
            log.warn("ui_error eventId={} action={} clientRequestId={} message={} stack={}",safe.id(),safe.action(),safe.requestId(),safe.message(),safe.stack());
        }
    }
    private String cut(String value,int max) { return value==null?"":value.substring(0,Math.min(max,value.length())); }
    @GetMapping("/diagnostics/events") public synchronized List<Event> recent() {
        var cutoff=Instant.now().minusSeconds(86400);
        events.removeIf(e->Instant.parse(e.timestamp()).isBefore(cutoff)); return List.copyOf(events);
    }
    @GetMapping("/health") public Map<String,Object> health() {
        resources.count(); return Map.of("status","UP","ready",!gate.busy(),"workspaceBusy",gate.busy(),"build","modernization-1","requestId",Optional.ofNullable(MDC.get("requestId")).orElse(""));
    }
    @GetMapping("/capabilities") public Map<String,Object> capabilities() { return Map.of("build","modernization-1","authentication",false,"workspaceTransfer",List.of("merge","replace"),"exportFormats","/api/export-formats","openapi","/api/openapi.json","diagnosticsRetention", "200 events / 24 hours / process lifetime"); }
    @GetMapping("/diagnostics/integrity") public Map<String,Object> integrity() {
        if(!gate.enterRequest()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Workspace transfer in progress");
        try {
            var all=resources.findAll(); var ids=new HashSet<String>(); all.forEach(r->ids.add(r.getId()));
            List<Map<String,String>> issues=new ArrayList<>();
            for(var r:all) {
                if("file".equals(r.getType()) && !Files.isRegularFile(files.getFile(r.getFilePath()))) issues.add(Map.of("resourceId",r.getId(),"code","MISSING_BINARY"));
                if("note".equals(r.getType())) {
                    try {
                        var doc=documents.parse(r.getContent()); documents.validate(doc);
                        for(String id:documents.references(doc)) if(!ids.contains(id)) issues.add(Map.of("resourceId",r.getId(),"code","DANGLING_REFERENCE","targetId",id));
                        var actual=new HashSet<>(relationships.findByFromIdAndType(r.getId(),"link").stream().map(x->x.getToId()).toList());
                        if(!actual.equals(links.extractLinks(r.getContent()))) issues.add(Map.of("resourceId",r.getId(),"code","BACKLINK_MISMATCH"));
                    } catch(Exception e) { issues.add(Map.of("resourceId",r.getId(),"code","INVALID_DOCUMENT")); }
                }
            }
            return Map.of("healthy",issues.isEmpty(),"resourceCount",all.size(),"issues",issues);
        } finally { gate.leaveRequest(); }
    }
}
