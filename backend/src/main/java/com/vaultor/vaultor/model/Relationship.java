package com.vaultor.vaultor.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Entity
@Table(name = "relationships")
@Data
@NoArgsConstructor
public class Relationship {
    @Id
    private String id = UUID.randomUUID().toString();

    private String fromId;
    private String toId;
    private String type;
    
    public Relationship(String fromId, String toId, String type) {
        this.fromId = fromId;
        this.toId = toId;
        this.type = type;
    }
}
