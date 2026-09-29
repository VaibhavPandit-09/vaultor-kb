package com.vaultor.vaultor.service;

import com.vaultor.vaultor.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Bounded breadth-first traversal. Caller holds the workspace mutation gate. */
@Service @RequiredArgsConstructor
public class NoteExportGraph {
    private final ResourceRepository resources;
    private final DocumentService documents;
    private final FileStorageService files;
    @Value("${app.export.max-nodes:200}") private int maxNodes;
    @Value("${app.export.max-depth:20}") private int maxDepth;
    @Value("${app.export.max-total-bytes:157286400}") private long maxBytes;
    @Value("${app.export.max-asset-bytes:104857600}") private long maxAssets;
    @Value("${app.transfer.max-archive-bytes}") private long maxArchive;
    public record Preview(int notes,int files,List<String> noteIds,List<String> resourceIds,List<String> warnings,String fingerprint) {}
    public record Graph(TransferService.Workspace workspace,Map<String,Path> binaries,Preview preview) {}
    private record Visit(String id,int depth) {}
    public Graph collect(String noteId,boolean linked) {
        if(noteId==null || noteId.isBlank()) throw new IllegalArgumentException("noteId is required");
        var queue=new ArrayDeque<Visit>();queue.add(new Visit(noteId,0));
        var seen=new LinkedHashSet<String>();var selected=new ArrayList<TransferService.ResourceData>();
        var binaries=new LinkedHashMap<String,Path>();var notes=new ArrayList<String>();var warnings=new LinkedHashSet<String>();
        StringBuilder version=new StringBuilder();long total=0,assets=0;int fileCount=0;
        try {
            while(!queue.isEmpty()) {
                var visit=queue.remove();if(!seen.add(visit.id()))continue;
                if(seen.size()>maxNodes) throw new IllegalArgumentException("Export graph exceeds "+maxNodes+" resources");
                if(visit.depth()>maxDepth) throw new IllegalArgumentException("Export graph exceeds depth "+maxDepth);
                var found=resources.findById(visit.id());
                if(found.isEmpty()) {
                    if(visit.depth()==0)throw new NoSuchElementException("Note not found");
                    version.append("missing:").append(visit.id());warnings.add("A linked resource is missing; its label is retained.");continue;
                }
                var r=found.get();if(visit.depth()==0 && !"note".equals(r.getType()))throw new IllegalArgumentException("Only notes can be exported");
                version.append(r.getId()).append(':').append(r.getRevision()).append(';');
                var content="note".equals(r.getType()) && (linked || visit.depth()==0)?documents.parse(r.getContent()):null;
                String binary=null;
                if(content!=null) {
                    documents.validate(content);notes.add(r.getId());total+=content.toString().getBytes(StandardCharsets.UTF_8).length;
                    // Only actual content nodes supply graph edges, never arbitrary attributes or marks.
                    var refs=new LinkedHashSet<String>();references(content,refs);
                    for(String id:refs)if(!seen.contains(id))queue.add(new Visit(id,visit.depth()+1));
                }
                if("file".equals(r.getType())) {
                    fileCount++;Path source=r.getFilePath()==null?null:files.getFile(r.getFilePath());
                    if(source!=null && Files.isRegularFile(source)) {
                        long size=Files.size(source);assets+=size;total+=size;
                        version.append(size).append(':').append(Files.getLastModifiedTime(source));
                        binary="assets/"+(fileCount)+"-"+r.getTitle().substring(0,Math.min(80,r.getTitle().length())).replaceAll("[^A-Za-z0-9._-]","_");
                        binaries.put(binary,source);
                    } else {warnings.add("Missing file: "+r.getTitle());version.append("missing-bytes");}
                }
                if(assets>Math.min(maxAssets,maxArchive))throw new IllegalArgumentException("Export assets exceed "+Math.min(maxAssets,maxArchive)+" bytes");
                if(total>maxBytes)throw new IllegalArgumentException("Export graph exceeds "+maxBytes+" total bytes");
                selected.add(new TransferService.ResourceData(r.getId(),r.getType(),r.getTitle(),content,r.getMimeType(),r.getSize(),r.getCreatedAt(),r.getUpdatedAt(),null,List.of(),binary));
            }
            var fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(version.toString().getBytes(StandardCharsets.UTF_8)));
            return new Graph(new TransferService.Workspace(List.copyOf(selected),List.of(),null),Map.copyOf(binaries),new Preview(notes.size(),fileCount,List.copyOf(notes),List.copyOf(seen),warnings.stream().limit(100).toList(),fingerprint));
        } catch(java.io.IOException | java.security.NoSuchAlgorithmException e) {throw new IllegalStateException("Cannot snapshot export graph",e);}
    }
    private void references(tools.jackson.databind.JsonNode n,Set<String> refs) {
        String key=switch(n.path("type").asText()) {case "resourceLink","image" -> "resourceId";case "table" -> "sourceResourceId";default -> null;};
        if(key!=null && !n.path("attrs").path(key).asText("").isBlank())refs.add(n.path("attrs").path(key).asText());
        for(var child:DocumentService.children(n))references(child,refs);
    }
}
