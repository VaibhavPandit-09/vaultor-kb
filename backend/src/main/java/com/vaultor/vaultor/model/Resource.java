package com.vaultor.vaultor.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "resources", indexes = { @Index(name = "idx_resource_title", columnList = "title,id"), @Index(name = "idx_resource_updated", columnList = "updated_at,id"), @Index(name = "idx_resource_opened", columnList = "last_opened_at,id") })
@Data
@NoArgsConstructor
public class Resource {
    @Id
    private String id = UUID.randomUUID().toString();

    @Column(nullable = false)
    private String type; // note, managed file, or metadata-only linked reference

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content; // JSON content for notes, null for files

    @Column(name = "file_path")
    private String filePath; // Only for files

    @Column(name = "mime_type")
    private String mimeType;

    private Long size;

    private Boolean favorite = false;

    // Additive, nullable columns: existing rows remain active. Never auto-purge.
    private LocalDateTime trashedAt;
    private Boolean purgePending = false;
    @Column(columnDefinition = "TEXT")
    private String trashOrganization;

    @Version
    @Column(nullable = false, columnDefinition = "bigint default 0")
    private Long revisionNumber = 0L;

    private String revisionSeed = UUID.randomUUID().toString();

    // Clients treat this as an opaque validator, not a timestamp. Never archived.
    public String getRevision() {
        return java.util.UUID.nameUUIDFromBytes((id + ":" + revisionSeed + ":" + revisionNumber).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
    }

    private String importFingerprint; // Internal retry identity; omitted from DTOs/archives.
    private String importResolvedFingerprint;

    // Original input of a converted import, never an independently visible resource.
    private String importOriginalPath;
    private String importOriginalName;
    private String importOriginalMime;
    private String importOriginalHash;
    private Long importOriginalSize;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "last_opened_at")
    private LocalDateTime lastOpenedAt;

    @ManyToMany
    @JoinTable(
        name = "resource_tags",
        joinColumns = @JoinColumn(name = "resource_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    private Set<Tag> tags = new HashSet<>();

    @ManyToMany
    @JoinTable(name="resource_collections",joinColumns=@JoinColumn(name="resource_id"),inverseJoinColumns=@JoinColumn(name="collection_id"))
    private Set<ResourceCollection> collections = new HashSet<>();

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (updatedAt == null) updatedAt = LocalDateTime.now();
        if (lastOpenedAt == null) lastOpenedAt = LocalDateTime.now();
        validateIntegrity();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
        validateIntegrity();
    }

    private void validateIntegrity() {
        if ("note".equals(type)) {
            if (content == null) content = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}";
            filePath = null;
        } else if ("file".equals(type)) {
            if (filePath == null) throw new IllegalStateException("File resources must have a file_path");
            content = null;
        } else if ("linked".equals(type)) {
            if(content==null)throw new IllegalStateException("Linked reference descriptor is required");
            filePath=null;importOriginalPath=null;size=null;
        }
    }
}
