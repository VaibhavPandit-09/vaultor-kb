package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.WorkspaceIdentityService;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;
@RestController @RequiredArgsConstructor
public class WorkspaceIdentityController {
 private final WorkspaceIdentityService identity;
 @GetMapping("/api/workspace/identity") public WorkspaceIdentityService.Identity current() {return identity.current();}
}
