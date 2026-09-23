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
    private final FileStorageService files;
    private final DocumentService documents;
    private final RelationshipService links;
    private final TransactionTemplate transaction;

    public synchronized Resource create(String id, String title, String content, MultipartFile file) throws Exception {
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
        String fingerprint = HexFormat.of().formatHex(digest.digest());
        var existing = resources.findById(id);
        if (existing.isPresent()) {
            if (!fingerprint.equals(existing.get().getImportFingerprint())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Import ID already used with different content");
            return existing.get();
        }
        String stored = file == null ? null : files.storeFile(file);
        try {
            return transaction.execute(status -> {
                var resource = new Resource(); resource.setId(id); resource.setType(kind); resource.setTitle(title.trim());
                resource.setContent(normalized); resource.setImportFingerprint(fingerprint); resource.setFilePath(stored);
                if (file != null) { resource.setSize(file.getSize()); resource.setMimeType(file.getContentType()); }
                var saved = resources.saveAndFlush(resource);
                if (normalized != null) links.updateLinksForNote(id, normalized);
                return saved;
            });
        } catch (Exception e) { if (stored != null) files.deleteFile(stored); throw e; }
    }
}
