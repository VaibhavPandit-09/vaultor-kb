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

    @PostMapping @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public ApiDtos.TagDto create(@RequestBody Map<String,String> input) { return ApiDtos.TagDto.of(tagService.getOrCreateTag(input.get("name"))); }
    @PutMapping("/{id}/name")
    public ApiDtos.TagDto rename(@PathVariable String id,@RequestBody Map<String,String> input) { return ApiDtos.TagDto.of(tagService.rename(id,input.get("name"))); }

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
