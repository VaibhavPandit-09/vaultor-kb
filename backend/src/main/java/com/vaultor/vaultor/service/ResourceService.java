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

    public Resource createNote(String title, String content) {
        Resource r = new Resource();
        r.setType("note");
        r.setTitle(title != null ? title : "Untitled");
        r.setContent(content);
        Resource saved = resourceRepository.save(r);
        relationshipService.updateLinksForNote(saved.getId(), saved.getContent());
        return saved;
    }

    public Resource updateNote(String id, String title, String content) {
        return resourceRepository.findById(id).map(r -> {
            if (title != null) r.setTitle(title);
            r.setContent(content);
            Resource saved = resourceRepository.save(r);
            relationshipService.updateLinksForNote(saved.getId(), saved.getContent());
            return saved;
        }).orElseThrow(() -> new RuntimeException("Note not found"));
    }

    public Resource uploadFile(MultipartFile file) throws IOException {
        String storedName = fileStorageService.storeFile(file);
        Resource r = new Resource();
        r.setType("file");
        r.setTitle(file.getOriginalFilename());
        r.setFilePath(storedName);
        r.setMimeType(file.getContentType());
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
        resourceRepository.findById(id).ifPresent(r -> {
            if ("file".equals(r.getType()) && r.getFilePath() != null) {
                try {
                    fileStorageService.deleteFile(r.getFilePath());
                } catch (IOException ignored) {}
            }
            relationshipService.deleteRelationshipsFor(id);
            resourceRepository.delete(r);
        });
    }

    @Transactional
    public void replaceLinksAndDelete(String oldId, String newId) {
        if (!resourceRepository.existsById(newId)) {
            throw new IllegalArgumentException("Replacement resource not found");
        }
        relationshipService.replaceLinks(oldId, newId);
        deleteResource(oldId);
    }

    public Resource getResourceOrThrow(String id) {
        return resourceRepository.findById(id).orElseThrow(() -> new RuntimeException("Resource not found"));
    }
}
