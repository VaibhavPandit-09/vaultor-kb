package com.vaultor.vaultor.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class LinkExtractionService {
    private final ObjectMapper objectMapper;

    public Set<String> extractLinks(String contentJson) {
        Set<String> linkedResourceIds = new HashSet<>();
        if (contentJson == null || contentJson.trim().isEmpty()) {
            return linkedResourceIds;
        }

        try {
            JsonNode root = objectMapper.readTree(contentJson);
            traverse(root, linkedResourceIds);
        } catch (Exception e) {
            log.warn("Failed to parse note content for links.", e);
        }
        return linkedResourceIds;
    }

    private void traverse(JsonNode node, Set<String> links) {
        if (node.isObject()) {
            if (node.has("type") && "resourceLink".equals(node.get("type").asText())) {
                JsonNode attrs = node.get("attrs");
                if (attrs != null && attrs.has("resourceId")) {
                    links.add(attrs.get("resourceId").asText());
                }
            }
            node.properties().forEach(entry -> traverse(entry.getValue(), links));
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                traverse(child, links);
            }
        }
    }
}
