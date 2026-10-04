package com.vaultor.vaultor.controller;
import com.vaultor.vaultor.service.ChangeFeed;
import com.vaultor.vaultor.host.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
@RestController
public class ChangeController {
    private final ChangeFeed feed;
    public ChangeController(ChangeFeed feed){this.feed=feed;}
    @GetMapping(value="/api/changes",produces="text/event-stream")
    public SseEmitter changes(@RequestParam(required=false) String cursor,HttpServletRequest request) {
        if(cursor!=null && (cursor.length()>100 || !cursor.matches("[a-f0-9-]{36}:[0-9]{1,18}")))throw new IllegalArgumentException("Invalid change cursor");
        var principal=request.getAttribute(HostAccessFilter.PRINCIPAL);
        return feed.connect(cursor,principal instanceof HostAccess.Device d?d.id():null);
    }
}
