package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.*;import com.vaultor.vaultor.workspaces.WorkspaceController;import jakarta.servlet.http.*;import org.springframework.web.bind.annotation.*;import java.util.*;
@RestController @RequestMapping("/api/companions")
public class CompanionExportController {
 private final TransferService transfers;public CompanionExportController(TransferService transfers){this.transfers=transfers;}
 private String device(HttpServletRequest r){return Optional.ofNullable(WorkspaceController.device(r)).orElse("OWNER");}
 @GetMapping("/export-capabilities") public Map<String,Object> capabilities(){return Map.of("version",1,"partialPackage",1,"partialArchive",6,"maxResources",500,"maxDepth",3,"maxBytes",268435456,"noteFormats",List.of("md","md-assets","pdf","docx"));}
 @PutMapping("/exports/{id}") public TransferService.ExportReceipt create(@PathVariable String id,@RequestBody TransferService.ExportRequest input,HttpServletRequest r)throws Exception{return transfers.prepareCompanionExport(id,input,device(r));}
 @GetMapping("/exports/{id}") public TransferService.ExportReceipt get(@PathVariable String id,@RequestParam String generation,HttpServletRequest r)throws Exception{return transfers.companionExport(id,generation,device(r));}
 @GetMapping("/exports/{id}/download") public void download(@PathVariable String id,@RequestParam String generation,HttpServletRequest r,HttpServletResponse response)throws Exception{transfers.streamCompanionExport(id,generation,device(r),response);}
}
