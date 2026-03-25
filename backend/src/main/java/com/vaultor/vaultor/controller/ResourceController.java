package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.model.Relationship;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.repository.RelationshipRepository;
import com.vaultor.vaultor.service.FileStorageService;
import com.vaultor.vaultor.service.ResourceService;
import com.vaultor.vaultor.service.TagService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/resources")
@RequiredArgsConstructor
public class ResourceController {

    private final ResourceService resourceService;
    private final ResourceRepository resourceRepository;
    private final RelationshipRepository relationshipRepository;
    private final TagService tagService;
    private final FileStorageService fileStorageService;
    private final ObjectMapper objectMapper;

    // ─── List & Search ───────────────────────────────────────

    @GetMapping
    public List<Resource> getAllResources(@RequestParam(value = "tag", required = false) String tagFilter) {
        List<Resource> all = resourceRepository.findAllByOrderByLastOpenedAtDescUpdatedAtDesc();
        if (tagFilter != null && !tagFilter.isBlank()) {
            return all.stream()
               .filter(r -> r.getTags().stream().anyMatch(t -> t.getName().equalsIgnoreCase(tagFilter)))
               .collect(Collectors.toList());
        }
        return all;
    }

    @GetMapping("/search")
    public List<Resource> searchResources(@RequestParam("q") String query) {
        if (query == null || query.trim().isEmpty()) {
            return resourceRepository.findAllByOrderByLastOpenedAtDescUpdatedAtDesc();
        }
        List<Resource> results = resourceRepository.findByTitleContainingIgnoreCase(query);
        results.sort((a, b) -> {
            boolean aExact = a.getTitle().equalsIgnoreCase(query);
            boolean bExact = b.getTitle().equalsIgnoreCase(query);
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return b.getUpdatedAt().compareTo(a.getUpdatedAt());
        });
        return results;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Resource> getResource(@PathVariable String id) {
        return resourceRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ─── Open Tracking ──────────────────────────────────────

    @PostMapping("/{id}/open")
    public ResponseEntity<Void> markOpened(@PathVariable String id) {
        resourceRepository.findById(id).ifPresent(r -> {
            r.setLastOpenedAt(LocalDateTime.now());
            resourceRepository.save(r);
        });
        return ResponseEntity.ok().build();
    }

    // ─── CRUD ────────────────────────────────────────────────

    @PostMapping("/note")
    public Resource createNote(@RequestBody Map<String, String> payload) {
        return resourceService.createNote(payload.get("title"), payload.get("content"));
    }

    @PostMapping
    public Resource createResource(@RequestBody Map<String, Object> payload) {
        String type = String.valueOf(payload.getOrDefault("type", "note"));
        String title = String.valueOf(payload.getOrDefault("title", "Untitled"));
        String content = null;
        if (payload.get("content") != null) {
            try {
                content = payload.get("content") instanceof String
                        ? (String) payload.get("content")
                        : objectMapper.writeValueAsString(payload.get("content"));
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid content payload", e);
            }
        }
        return resourceService.createResource(type, title, content);
    }

    @PutMapping("/{id}/note")
    public Resource updateNote(@PathVariable String id, @RequestBody Map<String, String> payload) {
        return resourceService.updateNote(id, payload.get("title"), payload.get("content"));
    }

    @PostMapping("/empty")
    public Resource createEmptyResource(@RequestBody Map<String, String> payload) {
        String type = payload.getOrDefault("type", "note");
        String title = payload.getOrDefault("title", "Untitled");
        if (!"note".equals(type)) {
            throw new IllegalArgumentException("Cannot create empty resource of type " + type);
        }
        return resourceService.createNote(title, "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}");
    }

    @PostMapping("/file")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(resourceService.uploadFile(file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteResource(@PathVariable String id) {
        resourceService.deleteResource(id);
        return ResponseEntity.noContent().build();
    }

    // ─── File Serving ────────────────────────────────────────

    @GetMapping("/{id}/download")
    public ResponseEntity<org.springframework.core.io.Resource> downloadFile(@PathVariable String id) {
        return resourceRepository.findById(id).map(f -> {
            if (!"file".equals(f.getType())) return ResponseEntity.badRequest().<org.springframework.core.io.Resource>build();
            try {
                Path path = fileStorageService.getFile(f.getFilePath());
                org.springframework.core.io.Resource resource = new UrlResource(path.toUri());
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(f.getMimeType() != null ? f.getMimeType() : "application/octet-stream"))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + f.getTitle() + "\"")
                        .body(resource);
            } catch (Exception e) {
                return ResponseEntity.internalServerError().<org.springframework.core.io.Resource>build();
            }
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/raw")
    public ResponseEntity<org.springframework.core.io.Resource> rawFile(@PathVariable String id) {
        return resourceRepository.findById(id).map(f -> {
            if (!"file".equals(f.getType())) return ResponseEntity.badRequest().<org.springframework.core.io.Resource>build();
            try {
                Path path = fileStorageService.getFile(f.getFilePath());
                org.springframework.core.io.Resource resource = new UrlResource(path.toUri());
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(f.getMimeType() != null ? f.getMimeType() : "application/octet-stream"))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + f.getTitle() + "\"")
                        .body(resource);
            } catch (Exception e) {
                return ResponseEntity.internalServerError().<org.springframework.core.io.Resource>build();
            }
        }).orElse(ResponseEntity.notFound().build());
    }

    // ─── Backlinks & Replace ─────────────────────────────────

    @GetMapping("/{id}/backlinks")
    public List<Resource> getBacklinks(@PathVariable String id) {
        List<Relationship> relationships = relationshipRepository.findByToIdAndType(id, "link");
        List<String> callerIds = relationships.stream().map(Relationship::getFromId).collect(Collectors.toList());
        return resourceRepository.findAllById(callerIds);
    }

    @PostMapping("/{id}/replace-links")
    public ResponseEntity<Void> replaceLinks(@PathVariable String id, @RequestBody Map<String, String> payload) {
        String newId = payload.get("newResourceId");
        if (newId == null || newId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        if (!resourceRepository.existsById(newId)) {
            return ResponseEntity.badRequest().build();
        }
        resourceService.replaceLinksAndDelete(id, newId);
        return ResponseEntity.ok().build();
    }

    // ─── Tags ────────────────────────────────────────────────

    @PostMapping("/{id}/tags/{tagName}")
    public ResponseEntity<Void> addTag(@PathVariable String id, @PathVariable String tagName) {
        tagService.addTagToResource(id, tagName);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}/tags/{tagName}")
    public ResponseEntity<Void> removeTag(@PathVariable String id, @PathVariable String tagName) {
        tagService.removeTagFromResource(id, tagName);
        return ResponseEntity.noContent().build();
    }
}
