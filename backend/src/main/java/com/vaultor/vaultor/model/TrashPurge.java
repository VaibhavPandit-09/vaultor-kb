package com.vaultor.vaultor.model;
import jakarta.persistence.*;
import lombok.Data;
/** Local generation-bound snapshot and receipt. Never included in archives. */
@Entity @Table(name="trash_purges") @Data
public class TrashPurge {
    @Id private String id;
    @Column(columnDefinition="TEXT",nullable=false) private String receipt;
}
