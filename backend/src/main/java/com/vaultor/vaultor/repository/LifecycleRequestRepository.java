package com.vaultor.vaultor.repository;
import com.vaultor.vaultor.model.LifecycleRequest;
import org.springframework.data.jpa.repository.JpaRepository;
public interface LifecycleRequestRepository extends JpaRepository<LifecycleRequest,String> {
    java.util.List<LifecycleRequest> findByResourceIdAndStatus(String resourceId,String status);
    boolean existsByResourceIdAndStatus(String resourceId,String status);
}
