package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.OrganizationService;
import com.vaultor.vaultor.service.OrganizationService.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api") @RequiredArgsConstructor
public class OrganizationController {
    private final OrganizationService service;
    @GetMapping("/collections") public CollectionPage list(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="false") boolean favorites,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {return service.list(q,favorites,page,size);}
    @GetMapping("/collections/{id}") public CollectionDto one(@PathVariable String id) {return service.get(id);}
    @PutMapping("/collections/creations/{id}") public CollectionDto createOnce(@PathVariable String id,@RequestBody CreationInput input) {return service.createOnce(id,input);}
    @PutMapping("/collections/{id}/favorite") @ResponseStatus(HttpStatus.NO_CONTENT) public void pin(@PathVariable String id,@RequestBody ApiDtos.FavoriteInput input) {service.pin(id,input.favorite());}
    @PostMapping("/organization/selection") public java.util.List<MembershipDto> selection(@RequestBody SelectionInput input) {return service.memberships(input);}
    @GetMapping("/organization/pins") public ApiDtos.PageDto<PinnedItem> pins(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {return service.pins(q,page,size);}
    @PostMapping("/collections") @ResponseStatus(HttpStatus.CREATED) public CollectionDto create(@RequestBody CollectionInput input) {return service.save(null,input);}
    @PutMapping("/collections/{id}") public CollectionDto update(@PathVariable String id,@RequestBody CollectionInput input) {return service.save(id,input);}
    @DeleteMapping("/collections/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String id) {service.delete(id);}
    @PostMapping("/organization/memberships") @ResponseStatus(HttpStatus.NO_CONTENT) public void bulk(@RequestBody BulkInput input) {service.bulk(input);}
    @GetMapping("/tags/browse") public ApiDtos.PageDto<TagSummary> tags(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {return service.tags(q,page,size);}
}
