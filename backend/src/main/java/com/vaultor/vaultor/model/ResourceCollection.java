package com.vaultor.vaultor.model;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.UUID;
@Entity @Table(name="collections") @Data @NoArgsConstructor
public class ResourceCollection {
    private String creationFingerprint;
    @Id private String id=UUID.randomUUID().toString();
    @Column(nullable=false) private String name;
    @Column(nullable=false,unique=true) private String normalizedName;
    @Column(nullable=false) private boolean favorite;
}
