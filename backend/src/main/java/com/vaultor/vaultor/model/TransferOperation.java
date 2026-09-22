package com.vaultor.vaultor.model;
import jakarta.persistence.*;
import lombok.Data;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="transfer_operations") @Data
public class TransferOperation {
    @Id private String id=UUID.randomUUID().toString();
    private String kind;
    private String status="QUEUED";
    private String phase="queued";
    private String mode;
    private int progress;
    private Integer resourceCount;
    private Integer fileCount;
    private Integer tagCount;
    private String requestId;
    private Instant createdAt=Instant.now();
    @Column(columnDefinition="TEXT") private String detail;
    @Column(columnDefinition="TEXT") private String journal="[]";
}
