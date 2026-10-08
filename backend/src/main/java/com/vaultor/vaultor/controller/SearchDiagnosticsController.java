package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.ResourceSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
@RestController @RequestMapping("/api/diagnostics/search") @RequiredArgsConstructor
public class SearchDiagnosticsController {
 private final ResourceSearchService search;
 private final com.vaultor.vaultor.service.FileContentIndex files;
 @GetMapping public ResourceSearchService.Status status(){return search.status();}
 @PostMapping("/rebuild") public ResourceSearchService.Status rebuild(HttpServletRequest request){return search.rebuild(org.slf4j.MDC.get("requestId"));}
 @GetMapping("/files") public ApiDtos.PageDto<com.vaultor.vaultor.service.FileContentIndex.Entry> files(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="30") int size){return files.jobs(page,size);}
 @PostMapping("/files/retry") public ResourceSearchService.Status retry(@RequestParam(required=false) String id){files.retry(id);return search.status();}
}
