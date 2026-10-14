package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.ReviewService;
import com.vaultor.vaultor.host.HostAccess;
import com.vaultor.vaultor.host.HostAccessFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/reviews")
public class ReviewController {
    private final ReviewService reviews;
    public ReviewController(ReviewService reviews){this.reviews=reviews;}
    public record StatusInput(String generation,String status) {}
    @GetMapping public ReviewService.Page list(@RequestParam(defaultValue="open") String status,@RequestParam(required=false) String resourceId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size){return reviews.list(status,resourceId,page,size);}
    @GetMapping("/{id}") public ReviewService.Item get(@PathVariable String id){return reviews.get(id);}
    @PutMapping("/{id}") public ReviewService.Item create(@PathVariable String id,@RequestBody ReviewService.Input body,HttpServletRequest request){Object p=request.getAttribute(HostAccessFilter.PRINCIPAL);return reviews.create(id,body,p instanceof HostAccess.Device d?d.name():"This computer");}
    @PatchMapping("/{id}/status") public ReviewService.Item status(@PathVariable String id,@RequestBody StatusInput body,@RequestHeader(value="If-Match",required=false) String match){return reviews.status(id,body.status(),match,body.generation());}
}
