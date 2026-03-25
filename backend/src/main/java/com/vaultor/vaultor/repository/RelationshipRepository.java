package com.vaultor.vaultor.repository;

import com.vaultor.vaultor.model.Relationship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface RelationshipRepository extends JpaRepository<Relationship, String> {
    List<Relationship> findByFromIdAndType(String fromId, String type);
    List<Relationship> findByToIdAndType(String toId, String type);
    void deleteByFromIdAndType(String fromId, String type);

    @Modifying
    @Query("UPDATE Relationship r SET r.toId = :newId WHERE r.toId = :oldId AND r.type = :type")
    int replaceToId(String oldId, String newId, String type);
}
