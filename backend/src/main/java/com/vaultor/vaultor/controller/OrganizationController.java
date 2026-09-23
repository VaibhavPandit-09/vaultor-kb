package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.OrganizationService;
import com.vaultor.vaultor.service.OrganizationService.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api") @RequiredArgsConstructor
public class OrganizationController {
    private final OrganizationService service;
    @GetMapping("/collections") public ApiDtos.PageDto<CollectionDto> list(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="false") boolean favorites,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {return service.list(q,favorites,page,size);}
    @PostMapping("/collections") @ResponseStatus(HttpStatus.CREATED) public CollectionDto create(@RequestBody CollectionInput input) {return service.save(null,input);}
    @PutMapping("/collections/{id}") public CollectionDto update(@PathVariable String id,@RequestBody CollectionInput input) {return service.save(id,input);}
    @DeleteMapping("/collections/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String id) {service.delete(id);}
    @PostMapping("/organization/memberships") @ResponseStatus(HttpStatus.NO_CONTENT) public void bulk(@RequestBody BulkInput input) {service.bulk(input);}
    @GetMapping("/tags/browse") public ApiDtos.PageDto<TagSummary> tags(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {return service.tags(q,page,size);}
}
