package com.vaultor.vaultor.service;

import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import java.util.*;

/** Shared structured-document traversal for links, transfers and future renderers. */
@Service @RequiredArgsConstructor
public class DocumentService {
    private final ObjectMapper mapper;
    /** Actual document children only: never interpret attrs or marks as content nodes. */
    public static List<JsonNode> children(JsonNode node) {
        List<JsonNode> result=new ArrayList<>();
        for(JsonNode child:node.path("content")) result.add(child);
        return result;
    }
    public JsonNode parse(String content) {
        if (content == null) return null;
        try { return mapper.readTree(content); }
        catch (Exception e) { throw new IllegalArgumentException("Invalid document JSON"); }
    }
    public void validate(JsonNode document) {
        if (document == null || !document.isObject() || !"doc".equals(document.path("type").asText()) || !document.path("content").isArray())
            throw new IllegalArgumentException("Note content must be a doc object with a content array");
        // Bound every JSON value, but interpret only actual document nodes as nodes.
        walk(document, ignored -> {});
        validateNode(document);
    }
    private void validateNode(JsonNode node) {
        if (!node.isObject() || !node.path("type").isTextual() || node.path("type").asText().isBlank()) throw new IllegalArgumentException("Document children require a node type");
        if (node.has("text") && !node.get("text").isTextual()) throw new IllegalArgumentException("Node text must be text");
        if (node.has("attrs") && !node.get("attrs").isObject()) throw new IllegalArgumentException("Node attrs must be an object");
        if (node.has("marks")) {
            if (!node.get("marks").isArray()) throw new IllegalArgumentException("Node marks must be an array");
            for (JsonNode mark : node.get("marks")) {
                if (!mark.isObject() || !mark.path("type").isTextual()) throw new IllegalArgumentException("Marks require a type");
                if (mark.has("attrs") && !mark.get("attrs").isObject()) throw new IllegalArgumentException("Mark attrs must be an object");
            }
        }
        if ("resourceLink".equals(node.path("type").asText()) && node.path("attrs").path("resourceId").asText().isBlank()) throw new IllegalArgumentException("Resource links require resourceId");
        if (node.has("content")) {
            if (!node.get("content").isArray()) throw new IllegalArgumentException("Node content must be an array");
            for (JsonNode child : node.get("content")) validateNode(child);
        }
    }
    public void walk(JsonNode node, java.util.function.Consumer<JsonNode> visitor) {
        walk(node, visitor, 0);
    }
    private void walk(JsonNode node, java.util.function.Consumer<JsonNode> visitor, int depth) {
        if (depth > 100) throw new IllegalArgumentException("Document exceeds maximum nesting depth 100");
        if (node == null) return;
        if (node.isObject()) { visitor.accept(node); node.properties().forEach(p -> walk(p.getValue(), visitor, depth + 1)); }
        else if (node.isArray()) for (JsonNode child : node) walk(child, visitor, depth + 1);
    }
    public JsonNode remap(JsonNode source, Map<String,String> ids) {
        JsonNode copy = source.deepCopy();
        walk(copy, node -> {
            if (node instanceof ObjectNode object) {
                for (String field : List.of("resourceId", "sourceResourceId")) {
                    String replacement = ids.get(node.path(field).asText());
                    if (replacement != null) object.put(field, replacement);
                }
            }
        });
        return copy;
    }
    public Set<String> references(JsonNode document) {
        Set<String> result = new LinkedHashSet<>();
        walk(document, node -> {
            for (String key : List.of("resourceId", "sourceResourceId")) if (node.hasNonNull(key)) result.add(node.get(key).asText());
        });
        return result;
    }
}
