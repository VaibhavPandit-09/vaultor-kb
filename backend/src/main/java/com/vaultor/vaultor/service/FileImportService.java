package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

/** Write-once resource creation: stable client IDs make uncertain retries safe. */
@Service @RequiredArgsConstructor
public class FileImportService {
    private final ResourceRepository resources;
    private final com.vaultor.vaultor.repository.LifecycleRequestRepository lifecycle;
    private final FileStorageService files;
    private final DocumentService documents;
    private final RelationshipService links;
    private final TransactionTemplate transaction;
    private final com.vaultor.vaultor.repository.CollectionRepository collections;

    public record Resolution(String title,String original,String resolvedContent,String collectionId) {}
    /** Finalize only an unchanged imported note. Receipts make lost-response retries harmless. */
    public synchronized Resource resolve(String id,Resolution input) throws Exception {
        String original=documents.parse(input.original()).toString(),content=documents.parse(input.resolvedContent()).toString();
        documents.validate(documents.parse(original));documents.validate(documents.parse(content));
        var digest=MessageDigest.getInstance("SHA-256");
        digest.update(("note\0"+input.title()+"\0\0").getBytes(StandardCharsets.UTF_8));digest.update(original.getBytes(StandardCharsets.UTF_8));
        if(input.collectionId()!=null)digest.update(("\0collection:"+input.collectionId()).getBytes(StandardCharsets.UTF_8));
        String creation=HexFormat.of().formatHex(digest.digest());
        String resolved=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        return transaction.execute(status->{
            var resource=resources.findById(id).orElseThrow();ResourceService.requireActive(resource);
            if(!creation.equals(resource.getImportFingerprint()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Import identity does not match");
            if(resolved.equals(resource.getImportResolvedFingerprint()))return resource;
            if(resource.getImportResolvedFingerprint()!=null || !original.equals(resource.getContent()) || !input.title().trim().equals(resource.getTitle()))throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED,"Imported note changed; its edits were preserved");
            for(String target:documents.references(documents.parse(content)))ResourceService.requireActive(resources.findById(target).orElseThrow());
            resource.setContent(content);resource.setImportResolvedFingerprint(resolved);var saved=resources.saveAndFlush(resource);links.updateLinksForNote(id,content);return saved;
        });
    }

    public synchronized Resource create(String id, String title, String content, MultipartFile file) throws Exception {
        return create(id,title,content,file,null);
    }
    public synchronized Resource create(String id,String title,String content,MultipartFile file,String collectionId) throws Exception {
        if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Import ID must be a canonical UUID");
        if (title == null || title.isBlank() || title.length() > 500) throw new IllegalArgumentException("Title must contain 1-500 characters");
        if ((content == null) == (file == null)) throw new IllegalArgumentException("Provide either content or file");
        String kind = content == null ? "file" : "note";
        String normalized = content == null ? null : documents.parse(content).toString();
        if (normalized != null) documents.validate(documents.parse(normalized));
        var digest = MessageDigest.getInstance("SHA-256");
        digest.update((kind + "\0" + title + "\0" + (file == null ? "" : file.getContentType()) + "\0").getBytes(StandardCharsets.UTF_8));
        if (file != null) {
            try (var in = file.getInputStream()) { byte[] buffer = new byte[8192]; int read; while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read); }
        } else digest.update(normalized.getBytes(StandardCharsets.UTF_8));
        if(collectionId != null) digest.update(("\0collection:"+collectionId).getBytes(StandardCharsets.UTF_8));
        String fingerprint = HexFormat.of().formatHex(digest.digest());
        var existing = resources.findById(id);
        if (existing.isPresent()) {
            ResourceService.requireActive(existing.get());
            if (!fingerprint.equals(existing.get().getImportFingerprint())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Import ID already used with different content");
            return existing.get();
        }
        if(lifecycle.existsByResourceIdAndStatus(id,"purged"))throw new ResponseStatusException(HttpStatus.GONE,"This original was permanently deleted. Use a new import identity for an explicit new resource.");
        if(collectionId != null && !collections.existsById(collectionId)) throw new java.util.NoSuchElementException("Collection not found");
        String stored = file == null ? null : files.storeFile(file);
        String mime=stored==null?null:FileMime.detect(files.getFile(stored),file.getContentType());
        try {
            return transaction.execute(status -> {
                var resource = new Resource(); resource.setId(id); resource.setType(kind); resource.setTitle(title.trim());
                resource.setContent(normalized); resource.setImportFingerprint(fingerprint); resource.setFilePath(stored);
                if (file != null) { resource.setSize(file.getSize()); resource.setMimeType(mime); }
                if(collectionId != null) resource.getCollections().add(collections.findById(collectionId).orElseThrow());
                var saved = resources.saveAndFlush(resource);
                if (normalized != null) links.updateLinksForNote(id, normalized);
                return saved;
            });
        } catch (Exception e) { if (stored != null) files.deleteFile(stored); throw e; }
    }
}
