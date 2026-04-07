package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.model.Tag;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.repository.TagRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class TagService {
    private final TagRepository tagRepository;
    private final ResourceRepository resourceRepository;

    @PostConstruct
    public void migrateMissingTagColors() {
        ensureTagColorsPersisted();
    }

    public Tag getOrCreateTag(String name) {
        String safeName = name.trim().toLowerCase();
        return tagRepository.findByNameIgnoreCase(safeName)
                .map(this::ensureTagColor)
                .orElseGet(() -> tagRepository.save(new Tag(safeName, generateColorForTagName(safeName))));
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
        ensureTagColorsPersisted();
        return tagRepository.findAll();
    }

    public Tag updateTagColor(String tagId, String color) {
        Tag tag = tagRepository.findById(tagId).orElseThrow();
        tag.setColor(normalizeIncomingColor(color, tag.getName()));
        return tagRepository.save(tag);
    }

    @Transactional
    public void ensureTagColorsPersisted() {
        List<Tag> tags = tagRepository.findAll();
        List<Tag> dirtyTags = new ArrayList<>();

        for (Tag tag : tags) {
            String nextColor = normalizeIncomingColor(tag.getColor(), tag.getName());
            if (!nextColor.equals(tag.getColor())) {
                tag.setColor(nextColor);
                dirtyTags.add(tag);
            }
        }

        if (!dirtyTags.isEmpty()) {
            tagRepository.saveAll(dirtyTags);
        }
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

    private Tag ensureTagColor(Tag tag) {
        String normalizedColor = normalizeIncomingColor(tag.getColor(), tag.getName());
        if (!normalizedColor.equals(tag.getColor())) {
            tag.setColor(normalizedColor);
            return tagRepository.save(tag);
        }
        return tag;
    }

    private String normalizeIncomingColor(String color, String tagName) {
        if (color == null || color.isBlank()) {
            return generateColorForTagName(tagName);
        }

        String normalized = color.trim();
        if (normalized.startsWith("#")) {
            if (normalized.length() == 4) {
                char r = normalized.charAt(1);
                char g = normalized.charAt(2);
                char b = normalized.charAt(3);
                return ("#" + r + r + g + g + b + b).toLowerCase(Locale.ROOT);
            }

            if (normalized.length() == 7) {
                return normalized.toLowerCase(Locale.ROOT);
            }
        }

        if (normalized.toLowerCase(Locale.ROOT).startsWith("hsl(") && normalized.endsWith(")")) {
            return normalized;
        }

        return generateColorForTagName(tagName);
    }

    public static String generateColorForTagName(String tagName) {
        String normalized = tagName == null ? "" : tagName.trim().toLowerCase(Locale.ROOT);
        int hash = 0;
        for (int index = 0; index < normalized.length(); index += 1) {
            hash = normalized.charAt(index) + ((hash << 5) - hash);
        }

        int positiveHash = Math.abs(hash == Integer.MIN_VALUE ? 0 : hash);
        int hue = positiveHash % 360;
        int saturation = 55 + ((positiveHash >> 3) % 16);
        int lightness = 45 + ((positiveHash >> 5) % 16);

        saturation = Math.max(55, Math.min(70, saturation));
        lightness = Math.max(45, Math.min(60, lightness));

        return String.format(Locale.ROOT, "hsl(%d %d%% %d%%)", hue, saturation, lightness);
    }
}
