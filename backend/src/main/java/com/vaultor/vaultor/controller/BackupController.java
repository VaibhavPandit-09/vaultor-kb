package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.BackupService;
import com.vaultor.vaultor.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class BackupController {
    private final BackupService backupService;
    private final AuthService authService;

    @GetMapping("/export")
    public ResponseEntity<StreamingResponseBody> exportData(@RequestParam("password") String password) {
        if (!authService.verifyPasswordLiteral(password)) {
            return ResponseEntity.status(401).build();
        }

        StreamingResponseBody stream = out -> {
            try {
                backupService.exportData(out, password);
            } catch (Exception e) {
                throw new RuntimeException("Export failed", e);
            }
        };

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"encrypted-export.bin\"")
                .contentType(MediaType.parseMediaType("application/octet-stream"))
                .body(stream);
    }

    @PostMapping("/import")
    public ResponseEntity<?> importData(@RequestParam("file") MultipartFile file, @RequestParam("password") String password) {
        if (authService.isSetup() && !authService.verifyPasswordLiteral(password)) {
            return ResponseEntity.status(401).body(java.util.Map.of("message", "Invalid master password"));
        }
        try {
            backupService.importData(file, password);
            
            new Thread(() -> {
                try { Thread.sleep(1000); } catch (Exception ignored) {}
                System.exit(0);
            }).start();

            return ResponseEntity.ok(java.util.Map.of("message", "Import successful. Backend is restarting..."));
        } catch (javax.crypto.AEADBadTagException e) {
            return ResponseEntity.status(400).body(java.util.Map.of("message", "Decryption failed: wrong password or corrupted file"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(java.util.Map.of("message", e.getMessage() != null ? e.getMessage() : "Unknown error"));
        }
    }
}
