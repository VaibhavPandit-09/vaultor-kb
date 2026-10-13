package com.vaultor.vaultor.workspaces;

import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.service.WorkspaceIdentityService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class WorkspaceController {
    private final WorkspaceCatalog catalog;private final WorkspaceRegistry registry;private final HostAccess access;
    public WorkspaceController(WorkspaceCatalog catalog,WorkspaceRegistry registry,HostAccess access){this.catalog=catalog;this.registry=registry;this.access=access;}
    public static String device(HttpServletRequest request){var p=request.getAttribute(HostAccessFilter.PRINCIPAL);if("OWNER".equals(p))return null;if(p instanceof HostAccess.Device d)return d.id();throw new AccessFailure(401,"DEVICE_APPROVAL_REQUIRED","Host approval is required");}
    public static void owner(HttpServletRequest request){if(!"OWNER".equals(request.getAttribute(HostAccessFilter.PRINCIPAL)))throw new AccessFailure(403,"OWNER_REQUIRED","Manage workspaces from the local owner connection");}
    @GetMapping("/api/workspaces") public List<WorkspaceCatalog.Entry> list(HttpServletRequest request){return catalog.list(device(request));}
    @GetMapping("/api/workspaces/{id}") public Map<String,Object> detail(@PathVariable String id,HttpServletRequest request) throws Exception {
        var d=device(request);catalog.require(id);if(d!=null && !catalog.allowed(id,d))throw new AccessFailure(404,"WORKSPACE_UNAVAILABLE","Workspace is unavailable or not authorized");
        var identity=registry.open(id).context().getBean(WorkspaceIdentityService.class).current();return Map.of("id",id,"name",catalog.require(id).name(),"generation",identity.generation(),"legacyDefault",id.equals(catalog.defaultId()));
    }
    @PutMapping("/api/owner/workspaces/{id}") public WorkspaceCatalog.Entry create(@PathVariable String id,@RequestBody Map<String,String> body,HttpServletRequest request) throws Exception {owner(request);var entry=catalog.create(id,body.get("name"));registry.open(id);return entry;}
    @PatchMapping("/api/owner/workspaces/{id}") public WorkspaceCatalog.Entry rename(@PathVariable String id,@RequestBody Map<String,String> body,HttpServletRequest request) throws Exception {owner(request);return catalog.rename(id,body.get("name"));}
    public record Grant(String deviceId,Boolean allowed) {}
    @PutMapping("/api/owner/workspaces/{id}/grants") public Map<String,Boolean> grant(@PathVariable String id,@RequestBody Grant body,HttpServletRequest request) throws Exception {owner(request);if(body.allowed()==null || !access.deviceActive(body.deviceId()))throw new IllegalArgumentException("Choose an approved device and explicit permission");catalog.grant(id,body.deviceId(),body.allowed());if(!body.allowed())registry.revoke(id,body.deviceId());return Map.of("allowed",body.allowed());}
}
