package com.vaultor.vaultor.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "resources")
@Data
@NoArgsConstructor
public class Resource {
    @Id
    private String id = UUID.randomUUID().toString();

    @Column(nullable = false)
    private String type; // "note" or "file"

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content; // JSON content for notes, null for files

    @Column(name = "file_path")
    private String filePath; // Only for files

    @Column(name = "mime_type")
    private String mimeType;

    private Long size;

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

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
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
        }
    }
}
