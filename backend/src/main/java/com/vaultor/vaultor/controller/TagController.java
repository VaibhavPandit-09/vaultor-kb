package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.model.Tag;
import com.vaultor.vaultor.service.TagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    @GetMapping
    public List<ApiDtos.TagDto> getAllTags() {
        return tagService.getAllTags().stream().map(ApiDtos.TagDto::of).toList();
    }

    @PutMapping("/{id}/color")
    public ApiDtos.TagDto updateTagColor(@PathVariable String id, @RequestBody Map<String, String> payload) {
        return ApiDtos.TagDto.of(tagService.updateTagColor(id, payload.get("color")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTag(@PathVariable String id) {
        tagService.deleteTag(id);
        return ResponseEntity.noContent().build();
    }
}
