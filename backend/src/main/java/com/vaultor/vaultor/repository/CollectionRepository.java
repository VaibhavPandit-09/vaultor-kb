package com.vaultor.vaultor.repository;
import com.vaultor.vaultor.model.ResourceCollection;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface CollectionRepository extends JpaRepository<ResourceCollection,String> {
    Optional<ResourceCollection> findByNormalizedName(String name);
}
