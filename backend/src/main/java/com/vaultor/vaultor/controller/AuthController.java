package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        return ResponseEntity.ok(java.util.Map.of("isSetup", authService.isSetup()));
    }

    @PostMapping("/setup")
    public ResponseEntity<?> setup(@RequestBody java.util.Map<String, String> body) {
        if (!body.containsKey("password")) return ResponseEntity.badRequest().build();
        try {
            authService.setup(body.get("password"));
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody java.util.Map<String, String> body) {
        if (!body.containsKey("password")) return ResponseEntity.badRequest().build();
        try {
            String token = authService.login(body.get("password"));
            return ResponseEntity.ok(java.util.Map.of("token", token));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }
    }
}
