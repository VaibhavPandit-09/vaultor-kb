package com.vaultor.vaultor.repository;

import com.vaultor.vaultor.model.Resource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ResourceRepository extends JpaRepository<Resource, String> {
    org.springframework.data.domain.Page<Resource> findDistinctByTags_NameIgnoreCase(String name, org.springframework.data.domain.Pageable pageable);
    List<Resource> findByTitleContainingIgnoreCase(String title);
    List<Resource> findByTypeOrderByUpdatedAtDesc(String type);
    List<Resource> findAllByOrderByUpdatedAtDesc();
    List<Resource> findAllByOrderByLastOpenedAtDescUpdatedAtDesc();
}
