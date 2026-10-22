package com.vaultor.vaultor.host;
import com.vaultor.vaultor.workspaces.WorkspaceController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
@RestController
public class CollectedZipController {
    private final CollectedZips zips;private final ObjectMapper json;
    public CollectedZipController(CollectedZips zips,ObjectMapper json){this.zips=zips;this.json=json;}
    @PutMapping("/api/collected-zips/{id}") public CollectedZips.Receipt submit(@PathVariable String id,@RequestParam String intent,@RequestParam MultipartFile file,HttpServletRequest r)throws Exception{String device=WorkspaceController.device(r);if(device==null)throw new AccessFailure(400,"DEVICE_REQUIRED","Use desktop workspace import for owner files");return zips.submit(id,json.readValue(intent,CollectedZips.Input.class),file,device);}
    @GetMapping("/api/collected-zips/{id}") public CollectedZips.Receipt get(@PathVariable String id,HttpServletRequest r)throws Exception{return zips.get(id,WorkspaceController.device(r));}
    @GetMapping("/api/owner/collected-zips") public List<CollectedZips.Receipt> list(HttpServletRequest r)throws Exception{WorkspaceController.owner(r);return zips.list();}
    @PostMapping("/api/owner/collected-zips/{id}/preview") public CollectedZips.Receipt preview(@PathVariable String id,HttpServletRequest r)throws Exception{WorkspaceController.owner(r);return zips.preview(id);}
    @PostMapping("/api/owner/collected-zips/{id}/approve") public CollectedZips.Receipt approve(@PathVariable String id,HttpServletRequest r)throws Exception{WorkspaceController.owner(r);return zips.approve(id);}
    @PostMapping("/api/owner/collected-zips/{id}/reject") public CollectedZips.Receipt reject(@PathVariable String id,HttpServletRequest r)throws Exception{WorkspaceController.owner(r);return zips.reject(id);}
}
