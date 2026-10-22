package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.CompanionImports;
import com.vaultor.vaultor.workspaces.WorkspaceController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.FileSystemResource;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
@RestController
public class CompanionImportController {
    private final CompanionImports imports;private final ObjectMapper json;private final com.vaultor.vaultor.host.HostAccess access;private final com.vaultor.vaultor.host.WorkspaceCatalog catalog;private final com.vaultor.vaultor.service.WorkspaceIdentityService identity;
    public CompanionImportController(CompanionImports imports,ObjectMapper json,com.vaultor.vaultor.host.HostAccess access,com.vaultor.vaultor.host.WorkspaceCatalog catalog,com.vaultor.vaultor.service.WorkspaceIdentityService identity){this.imports=imports;this.json=json;this.access=access;this.catalog=catalog;this.identity=identity;}
    private String device(HttpServletRequest r){return Optional.ofNullable(WorkspaceController.device(r)).orElse("OWNER");}
    @GetMapping("/api/companions/import-capabilities") public Map<String,Object> capabilities(){return Map.of("version",1,"maxBytes",CompanionImports.MAX_BYTES,"maxTextBytes",CompanionImports.MAX_TEXT,"modes",List.of("original","text","markdown"),"workspaceZip","owner-approval","archiveVersion",5);}
    @PutMapping(value="/api/resources/collected-imports/{id}",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public CompanionImports.Receipt create(@PathVariable String id,@RequestParam String intent,@RequestParam MultipartFile file,HttpServletRequest request)throws Exception{String device=device(request);return imports.create(id,json.readValue(intent,CompanionImports.Intent.class),file,device,()->device.equals("OWNER")||access.deviceActive(device)&&catalog.allowed(identity.current().id(),device));}
    @GetMapping("/api/resources/collected-imports/{id}") public CompanionImports.Receipt receipt(@PathVariable String id,@RequestParam String generation,HttpServletRequest request){return imports.get(id,generation,device(request));}
    @GetMapping("/api/resources/{id}/import-original") public ResponseEntity<FileSystemResource> original(@PathVariable String id){var path=imports.original(id);return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(imports.originalName(id),java.nio.charset.StandardCharsets.UTF_8).build().toString()).body(new FileSystemResource(path));}
}
