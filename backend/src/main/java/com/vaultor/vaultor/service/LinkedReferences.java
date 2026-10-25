package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.util.*;

/** Portable organization only. No native paths, grants, Markdown or revisions.
 * Creating this metadata cannot authorize a filesystem read or write. */
@Service @RequiredArgsConstructor
public class LinkedReferences {
    private final ResourceRepository resources;
    private final DocumentService documents;
    public record Input(String title,JsonNode reference) {}
    public record Registration(String id,String title,JsonNode reference) {}
    @Transactional public List<Resource> registerMany(List<Registration> values){
        if(values==null||values.size()>50)throw new IllegalArgumentException("At most50 linked references per batch");
        return values.stream().map(value->register(value.id(),new Input(value.title(),value.reference()))).toList();
    }
    public static void validate(JsonNode value){
        if(value==null||!value.isObject()||value.size()!=5||!value.path("type").asText().equals("linkedDocument")||value.path("version").asInt()!=1)throw new IllegalArgumentException("Invalid linked document reference");
        UUID.fromString(value.path("sourceId").asText());
        String name=value.path("sourceName").asText(),relative=value.path("relativePath").asText();
        if(name.isBlank()||name.length()>255||name.chars().anyMatch(c->c<32||"/\\:".indexOf(c)>=0)||relative.length()>1000||relative.isBlank()||relative.contains("\\")||relative.contains(":"))throw new IllegalArgumentException("Invalid linked source label or relative path");
        var segments=relative.split("/",-1);if(segments.length>32)throw new IllegalArgumentException("Linked path depth exceeds32");
        for(String part:segments)if(part.isBlank()||part.equals(".")||part.equals("..")||part.chars().anyMatch(c->c<32))throw new IllegalArgumentException("Invalid linked relative path");
        if(!relative.toLowerCase(Locale.ROOT).matches(".*\\.(md|markdown)$"))throw new IllegalArgumentException("Linked reference must identify Markdown");
    }
    @Transactional public Resource register(String id,Input input){
        UUID.fromString(id);if(input==null||input.title()==null||input.title().isBlank()||input.title().length()>500)throw new IllegalArgumentException("Invalid linked document title");validate(input.reference());
        var found=resources.findById(id);
        if(found.isPresent()){
            var existing=found.get();
            if(!existing.getType().equals("linked")||!documents.parse(existing.getContent()).equals(input.reference()))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Reference identity already describes different content");
            return existing;
        }
        var resource=new Resource();resource.setId(id);resource.setType("linked");resource.setTitle(input.title());resource.setContent(input.reference().toString());resource.setMimeType("text/markdown");return resources.saveAndFlush(resource);
    }
}
