package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Relationship;
import com.vaultor.vaultor.repository.RelationshipRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class RelationshipService {
    private final RelationshipRepository relationshipRepository;
    private final LinkExtractionService linkExtractionService;

    @Transactional
    public void deleteRelationshipsFor(String resourceId) {
        relationshipRepository.deleteByFromIdAndType(resourceId, "link");
    }

    @Transactional
    public void updateLinksForNote(String noteId, String contentJson) {
        relationshipRepository.deleteByFromIdAndType(noteId, "link");
        
        Set<String> linkedIds = linkExtractionService.extractLinks(contentJson);
        for (String targetId : linkedIds) {
            relationshipRepository.save(new Relationship(noteId, targetId, "link"));
        }
    }

    @Transactional
    public void replaceLinks(String oldId, String newId) {
        relationshipRepository.replaceToId(oldId, newId, "link");
    }
}
