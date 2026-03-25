package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.model.Tag;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class TagService {
    private final TagRepository tagRepository;
    private final ResourceRepository resourceRepository;

    public Tag getOrCreateTag(String name) {
        String safeName = name.trim().toLowerCase();
        return tagRepository.findByNameIgnoreCase(safeName)
                .orElseGet(() -> tagRepository.save(new Tag(safeName)));
    }

    public void addTagToResource(String resourceId, String tagName) {
        Resource r = resourceRepository.findById(resourceId).orElseThrow();
        Tag t = getOrCreateTag(tagName);
        r.getTags().add(t);
        resourceRepository.save(r);
    }

    public void removeTagFromResource(String resourceId, String tagName) {
        Resource r = resourceRepository.findById(resourceId).orElseThrow();
        tagRepository.findByNameIgnoreCase(tagName.trim()).ifPresent(t -> {
            r.getTags().remove(t);
            resourceRepository.save(r);
        });
    }

    public List<Tag> getAllTags() {
        return tagRepository.findAll();
    }

    @Transactional
    public void deleteTag(String tagId) {
        tagRepository.findById(tagId).ifPresent(tag -> {
            // Remove this tag from all resources that have it
            List<Resource> allResources = resourceRepository.findAll();
            for (Resource r : allResources) {
                if (r.getTags().remove(tag)) {
                    resourceRepository.save(r);
                }
            }
            tagRepository.delete(tag);
        });
    }
}
