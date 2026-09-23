package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.model.*;
import com.vaultor.vaultor.repository.*;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.controller.ApiDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.UrlResource;
import java.time.LocalDateTime;
import java.util.*;

@RestController @RequestMapping("/api/resources") @RequiredArgsConstructor
public class ResourceController {
    private final ResourceRepository resources;
    private final RelationshipRepository relationships;
    private final ResourceService service;
    private final TagService tags;
    private final FileStorageService files;
    private final DocumentService documents;
    private final FileImportService imports;
    @PutMapping(value="/imports/{id}", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResourceDto importFile(@PathVariable String id, @RequestParam String title, @RequestParam(required=false) String content, @RequestParam(required=false) MultipartFile file) throws Exception {
        return dto(imports.create(id,title,content,file));
    }
    private ResourceDto dto(Resource r) { return ResourceDto.of(r, documents); }
    private Resource get(String id) { return resources.findById(id).orElseThrow(); }
    private void validate(NoteInput input) {
        if (input.title() == null || input.title().isBlank() || input.title().length() > 500) throw new ApiErrors.FieldError("title", "Title must contain 1-500 characters");
        try { documents.validate(input.content()); } catch(IllegalArgumentException e) { throw new ApiErrors.FieldError("content", e.getMessage()); }
    }
    @GetMapping
    public PageDto<ResourceDto> list(@RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="100") int size, @RequestParam(required=false) String tag) {
        if (page < 0 || size < 1 || size > 200) throw new IllegalArgumentException("page must be nonnegative; size must be 1-200");
        var paging=org.springframework.data.domain.PageRequest.of(page,size,org.springframework.data.domain.Sort.by("lastOpenedAt","updatedAt","id").descending());
        var result=tag==null ? resources.findAll(paging) : resources.findDistinctByTags_NameIgnoreCase(tag,paging);
        return new PageDto<>(result.getContent().stream().map(this::dto).toList(), page, size, result.getTotalElements(), result.getTotalPages());
    }
    @GetMapping("/search") public List<ResourceDto> search(@RequestParam(defaultValue="") String q) {
        return resources.findByTitleContainingIgnoreCase(q.trim()).stream().sorted(Comparator.comparing((Resource r) -> !r.getTitle().equalsIgnoreCase(q)).thenComparing(Resource::getUpdatedAt, Comparator.reverseOrder())).limit(200).map(this::dto).toList();
    }
    @GetMapping("/{id}") public ResourceDto one(@PathVariable String id) { return dto(get(id)); }
    @PostMapping("/{id}/open") public void open(@PathVariable String id) { var r=get(id); r.setLastOpenedAt(LocalDateTime.now()); resources.save(r); }
    @PostMapping public ResourceDto create(@RequestBody NoteInput input) { validate(input); if (input.type()!=null && !input.type().equals("note")) throw new IllegalArgumentException("Use file upload for file resources"); return dto(service.createNote(input.title().trim(), input.content().toString())); }
    @PutMapping("/{id}/note") public ResourceDto update(@PathVariable String id, @RequestBody NoteInput input) { validate(input); if (!get(id).getType().equals("note")) throw new IllegalArgumentException("Resource is not a note"); return dto(service.updateNote(id, input.title().trim(), input.content().toString())); }
    @PostMapping("/file") public ResourceDto upload(@RequestParam MultipartFile file) throws Exception { if(file.isEmpty()) throw new IllegalArgumentException("Choose a nonempty file"); return dto(service.uploadFile(file)); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String id) { get(id); service.deleteResource(id); }
    @GetMapping("/{id}/backlinks") public List<ResourceDto> backlinks(@PathVariable String id) { get(id); return resources.findAllById(relationships.findByToIdAndType(id,"link").stream().map(Relationship::getFromId).toList()).stream().map(this::dto).toList(); }
    @PostMapping("/{id}/replace-links") public void replace(@PathVariable String id, @RequestBody Map<String,String> input) { get(id); service.replaceLinksAndDelete(id,input.get("newResourceId")); }
    @PostMapping("/{id}/tags/{name}") public void tag(@PathVariable String id,@PathVariable String name) { if(name.isBlank() || name.length()>100) throw new IllegalArgumentException("Tag must contain 1-100 characters"); tags.addTagToResource(id,name); }
    @DeleteMapping("/{id}/tags/{name}") public void untag(@PathVariable String id,@PathVariable String name) { tags.removeTagFromResource(id,name); }
    @GetMapping("/{id}/raw") public ResponseEntity<org.springframework.core.io.Resource> raw(@PathVariable String id) throws Exception { return binary(id,false); }
    @GetMapping("/{id}/download") public ResponseEntity<org.springframework.core.io.Resource> download(@PathVariable String id) throws Exception { return binary(id,true); }
    private ResponseEntity<org.springframework.core.io.Resource> binary(String id,boolean download) throws Exception {
        var r=get(id); if(!"file".equals(r.getType())) throw new IllegalArgumentException("Resource is not a file");
        var path=files.getFile(r.getFilePath()); if(!java.nio.file.Files.exists(path)) throw new NoSuchElementException("File bytes missing");
        MediaType mime; try { mime=MediaType.parseMediaType(r.getMimeType()); } catch(Exception e) { mime=MediaType.APPLICATION_OCTET_STREAM; }
        return ResponseEntity.ok().contentType(mime).header(HttpHeaders.CONTENT_DISPOSITION,(download ? ContentDisposition.attachment() : ContentDisposition.inline()).filename(r.getTitle(),java.nio.charset.StandardCharsets.UTF_8).build().toString()).body(new UrlResource(path.toUri()));
    }
}
