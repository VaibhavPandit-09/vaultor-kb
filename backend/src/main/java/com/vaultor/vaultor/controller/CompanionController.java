package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.CompanionSnapshots;
import com.vaultor.vaultor.workspaces.WorkspaceController;
import jakarta.servlet.http.*;
import org.springframework.web.bind.annotation.*;

/** Dataset preparation only. No original writes, queue acknowledgement or archive replacement. */
@RestController @RequestMapping("/api/companions")
public class CompanionController {
    private final CompanionSnapshots snapshots;
    public CompanionController(CompanionSnapshots snapshots){this.snapshots=snapshots;}
    @PostMapping("/estimate") public CompanionSnapshots.Estimate estimate(@RequestBody CompanionSnapshots.Selection selection,HttpServletRequest req) throws Exception {return snapshots.estimate(selection,WorkspaceController.device(req));}
    @PutMapping("/{id}") public CompanionSnapshots.Status create(@PathVariable String id,@RequestBody CompanionSnapshots.Selection selection,HttpServletRequest req) throws Exception {return snapshots.create(id,selection,WorkspaceController.device(req));}
    @GetMapping("/{id}") public CompanionSnapshots.Status status(@PathVariable String id,HttpServletRequest req) throws Exception {return snapshots.status(id,WorkspaceController.device(req));}
    @DeleteMapping("/{id}") public CompanionSnapshots.Status cancel(@PathVariable String id,HttpServletRequest req) throws Exception {return snapshots.cancel(id,WorkspaceController.device(req));}
    @GetMapping("/{id}/inventory") public CompanionSnapshots.Inventory inventory(@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="100") int size,HttpServletRequest req) throws Exception {return snapshots.inventory(id,WorkspaceController.device(req),match,page,size);}
    @GetMapping("/{id}/coverage") public CompanionSnapshots.Coverage coverage(@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="100") int size,HttpServletRequest req) throws Exception {return snapshots.coverage(id,WorkspaceController.device(req),match,page,size);}
    @GetMapping("/{id}/delta") public CompanionSnapshots.Delta delta(@PathVariable String id,@RequestParam String from,@RequestHeader(value="If-Match",required=false) String match,@RequestHeader(value="X-Vaultor-Base-Manifest",required=false) String base,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="100") int size,HttpServletRequest req) throws Exception {return snapshots.delta(id,from,WorkspaceController.device(req),match,base,page,size);}
    @GetMapping("/{id}/payloads/{key}") public void payload(@PathVariable String id,@PathVariable String key,@RequestHeader(value="If-Match",required=false) String match,@RequestHeader(value="Range",required=false) String range,HttpServletRequest req,HttpServletResponse res) throws Exception {try{snapshots.stream(id,key,WorkspaceController.device(req),match,range,res);}catch(Exception failure){if(res.isCommitted()){org.slf4j.LoggerFactory.getLogger(CompanionController.class).warn("companion_stream_stopped code={}",failure instanceof com.vaultor.vaultor.host.AccessFailure a?a.code:failure.getClass().getSimpleName());throw new org.springframework.web.context.request.async.AsyncRequestNotUsableException("Checkpoint download stopped",failure);}throw failure;}}
}
