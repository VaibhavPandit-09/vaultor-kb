package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.model.Tag;
import com.vaultor.vaultor.service.DocumentService;
import tools.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;

public final class ApiDtos {
    private ApiDtos() {}
    public record TagDto(String id, String name, String color) {
        public static TagDto of(Tag tag) { return new TagDto(tag.getId(), tag.getName(), tag.getColor()); }
    }
    public record CollectionRef(String id, String name) {}
    public record ResourceDto(String id, String type, String title, JsonNode content, String mimeType, Long size,
        LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime lastOpenedAt, List<TagDto> tags, boolean favorite, List<CollectionRef> collections) {
        public static ResourceDto of(Resource r, DocumentService documents) {
            return new ResourceDto(r.getId(), r.getType(), r.getTitle(), documents.parse(r.getContent()), r.getMimeType(), r.getSize(),
                r.getCreatedAt(), r.getUpdatedAt(), r.getLastOpenedAt(), r.getTags().stream().map(TagDto::of).toList(), Boolean.TRUE.equals(r.getFavorite()), r.getCollections().stream().sorted(java.util.Comparator.comparing(c -> c.getName().toLowerCase(java.util.Locale.ROOT))).map(c -> new CollectionRef(c.getId(),c.getName())).toList());
        }
    }
    public record ResourceSummary(String id, String type, String title, String mimeType, Long size,
        LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime lastOpenedAt, List<TagDto> tags, boolean favorite, List<CollectionRef> collections) {}
    public record FavoriteInput(Boolean favorite) {}
    public record NoteInput(String type, String title, JsonNode content, String collectionId) { public NoteInput(String type,String title,JsonNode content) {this(type,title,content,null);} }
    public record PageDto<T>(List<T> items, int page, int size, long totalItems, int totalPages) {}
}
