package com.vaultor.vaultor.model;
import jakarta.persistence.*;
import lombok.Data;
@Entity @Table(name="resource_lifecycle_requests",indexes=@Index(name="lifecycle_pending",columnList="resourceId,status")) @Data
public class LifecycleRequest {
    @Id private String id;
    private String resourceId;
    private String action;
    private String expectedRevision;
    private String status;
    @Column(columnDefinition="TEXT") private String result;
}
