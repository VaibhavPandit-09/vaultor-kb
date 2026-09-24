package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.ResourceSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
@RestController @RequestMapping("/api/diagnostics/search") @RequiredArgsConstructor
public class SearchDiagnosticsController {
 private final ResourceSearchService search;
 @GetMapping public ResourceSearchService.Status status(){return search.status();}
 @PostMapping("/rebuild") public ResourceSearchService.Status rebuild(HttpServletRequest request){return search.rebuild(org.slf4j.MDC.get("requestId"));}
}
