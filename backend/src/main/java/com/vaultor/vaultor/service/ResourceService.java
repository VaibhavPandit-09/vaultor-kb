package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Service
@RequiredArgsConstructor
public class ResourceService {
    private final ResourceRepository resourceRepository;
    private final FileStorageService fileStorageService;
    private final RelationshipService relationshipService;
    private final DocumentService documents;
    private final com.vaultor.vaultor.repository.CollectionRepository collections;

    @Transactional
    public Resource createNote(String title, String content) {
        return createNote(title,content,null);
    }

    @Transactional
    public Resource createNote(String title,String content,String collectionId) {
        Resource r = new Resource();
        if(collectionId != null) r.getCollections().add(collections.findById(collectionId).orElseThrow());
        r.setType("note");
        r.setTitle(title != null ? title : "Untitled");
        r.setContent(content);
        Resource saved = resourceRepository.saveAndFlush(r);
        relationshipService.updateLinksForNote(saved.getId(), saved.getContent());
        return saved;
    }

    @Transactional
    public Resource updateNote(String id, String title, String content) { return updateNote(id,title,content,null); }

    @Transactional
    public Resource updateNote(String id, String title, String content, String expected) {
        return resourceRepository.findById(id).map(r -> {
            requireActive(r);
            if (expected != null && !expected.equals("\"" + r.getRevision() + "\"")) throw new com.vaultor.vaultor.controller.ApiErrors.RevisionConflict();
            if (title != null) r.setTitle(title);
            r.setContent(content);
            Resource saved = resourceRepository.saveAndFlush(r);
            relationshipService.updateLinksForNote(saved.getId(), saved.getContent());
            return saved;
        }).orElseThrow(() -> new java.util.NoSuchElementException("Note not found"));
    }

    public Resource uploadFile(MultipartFile file) throws IOException {
        String storedName = fileStorageService.storeFile(file);
        Resource r = new Resource();
        r.setType("file");
        r.setTitle(file.getOriginalFilename());
        r.setFilePath(storedName);
        r.setMimeType(FileMime.detect(fileStorageService.getFile(r.getFilePath()),file.getContentType()));
        r.setSize(file.getSize());
        return resourceRepository.save(r);
    }

    public Resource createResource(String type, String title, String content) {
        if ("note".equals(type)) {
            return createNote(title, content);
        }
        throw new IllegalArgumentException("Unsupported resource type: " + type);
    }

    public void deleteResource(String id) {
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.METHOD_NOT_ALLOWED,"Use revision-checked Trash. Permanent deletion is available only in Trash.");
    }

    @Transactional
    public void replaceLinksAndDelete(String oldId, String newId) {
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.METHOD_NOT_ALLOWED,"Reference replacement and deletion are separate actions. Use Trash without rewriting referring notes.");
    }

    public Resource getResourceOrThrow(String id) {
        var resource=resourceRepository.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Resource not found"));requireActive(resource);return resource;
    }
    @Transactional public Resource rename(String id,String title,String expected) {var r=getResourceOrThrow(id);if(title==null||title.isBlank()||title.length()>500)throw new IllegalArgumentException("Title must contain 1–500 characters");if(!("\""+r.getRevision()+"\"").equals(expected))throw new com.vaultor.vaultor.controller.ApiErrors.RevisionConflict();r.setTitle(title.trim());return resourceRepository.saveAndFlush(r);}
    public static void requireActive(Resource resource) {if(resource.getTrashedAt()!=null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.GONE,"Resource is in Trash. Restore it before opening or editing.");}
}
