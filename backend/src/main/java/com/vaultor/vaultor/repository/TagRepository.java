package com.vaultor.vaultor.repository;

import com.vaultor.vaultor.model.Tag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TagRepository extends JpaRepository<Tag, String> {
    Optional<Tag> findByNameIgnoreCase(String name);
}
