package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.FileSystemResource;
import java.util.*;
@RestController @RequestMapping("/api") @RequiredArgsConstructor
public class TransferController {
    private final TransferService transfers;
    private final ExporterRegistry registry;
    @PostMapping("/exports") public TransferService.Operation export(@RequestBody Map<String,String> body) { return transfers.export(body.getOrDefault("scope","workspace"),body.getOrDefault("format","zip")); }
    @GetMapping("/export-formats") public List<ExporterRegistry.Format> formats() { return registry.available(); }
    @PostMapping("/imports/preview") public TransferService.Preview preview(@RequestParam MultipartFile file) throws Exception { return transfers.preview(file); }
    @PostMapping("/imports/{id}/commit") public TransferService.Operation commit(@PathVariable String id,@RequestBody Map<String,String> body) {
        String mode=body.get("mode"); if("replace".equals(mode) && !"replace".equals(body.get("confirmation"))) throw new IllegalArgumentException("Replacement requires confirmation: replace");
        return transfers.commit(id,mode);
    }
    @GetMapping("/operations/{id}") public TransferService.Operation operation(@PathVariable String id) { return transfers.get(id); }
    @PostMapping("/operations/{id}/cancel") public TransferService.Operation cancel(@PathVariable String id) { return transfers.cancel(id); }
    @GetMapping("/exports/{id}/download") public ResponseEntity<FileSystemResource> download(@PathVariable String id) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip")).header("Content-Disposition","attachment; filename=workspace.zip").body(new FileSystemResource(transfers.download(id)));
    }
}
