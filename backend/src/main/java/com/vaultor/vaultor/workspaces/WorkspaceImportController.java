package com.vaultor.vaultor.workspaces;
import com.vaultor.vaultor.host.WorkspaceImports;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import tools.jackson.databind.ObjectMapper;
@RestController
@RequestMapping("/api/workspace-imports")
public class WorkspaceImportController {
 private final WorkspaceImports imports;private final ObjectMapper json;
 public WorkspaceImportController(WorkspaceImports imports,ObjectMapper json){this.imports=imports;this.json=json;}
 @GetMapping public List<WorkspaceImports.Receipt> list(HttpServletRequest request)throws Exception{WorkspaceController.owner(request);return imports.list();}
 @GetMapping("/{id}") public WorkspaceImports.Receipt get(@PathVariable String id,HttpServletRequest request)throws Exception{WorkspaceController.owner(request);return imports.get(id);}
 @PutMapping(value="/{id}",consumes="multipart/form-data") public WorkspaceImports.Receipt preview(@PathVariable String id,@RequestParam String name,@RequestParam MultipartFile file,@RequestParam(required=false)String origin,HttpServletRequest request)throws Exception{WorkspaceController.owner(request);return imports.preview(id,name,origin==null?null:json.readValue(origin,WorkspaceImports.Origin.class),file);}
 @PostMapping("/{id}/commit") public WorkspaceImports.Receipt commit(@PathVariable String id,HttpServletRequest request)throws Exception{WorkspaceController.owner(request);return imports.commit(id);}
 @DeleteMapping("/{id}") public WorkspaceImports.Receipt cancel(@PathVariable String id,HttpServletRequest request)throws Exception{WorkspaceController.owner(request);return imports.cancel(id);}
}
