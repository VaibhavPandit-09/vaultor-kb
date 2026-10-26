package com.vaultor.vaultor.model;
import jakarta.persistence.*;
import lombok.Data;
/** Workspace-local receipt, deliberately excluded from portable archives. */
@Entity @Table(name="collection_deletions") @Data
public class CollectionDeletion {
    @Id private String id;
    @Column(columnDefinition="TEXT",nullable=false) private String input;
    @Column(columnDefinition="TEXT",nullable=false) private String result;
}
