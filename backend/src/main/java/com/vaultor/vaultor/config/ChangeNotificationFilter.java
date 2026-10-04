package com.vaultor.vaultor.config;
import com.vaultor.vaultor.service.ChangeFeed;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.slf4j.MDC;
import java.io.IOException;
import java.util.*;
/** Successful synchronous mutation handlers return only after their service transactions commit.
 * Async transfer commits publish from the worker, never from admission responses. */
@Component @Order(Ordered.HIGHEST_PRECEDENCE+3)
public class ChangeNotificationFilter extends OncePerRequestFilter {
    private final ChangeFeed feed;
    public ChangeNotificationFilter(ChangeFeed feed){this.feed=feed;}
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException {
        chain.doFilter(req,res);
        if(Set.of("GET","HEAD","OPTIONS").contains(req.getMethod()) || res.getStatus()>=300)return;
        String path=req.getRequestURI();String kind=null;
        if(path.matches("/api/resources/[^/]+/open"))return;
        if(path.equals("/api/organization/selection"))return;
        if(path.startsWith("/api/resources"))kind="resources";
        else if(path.startsWith("/api/settings"))kind="settings";
        else if(path.startsWith("/api/tags"))kind="tags";
        else if(path.startsWith("/api/collections")||path.startsWith("/api/organization"))kind="organization";
        if(kind!=null){var parts=path.split("/");var ids=kind.equals("resources") && !path.endsWith("/replace-links") && parts.length>3 && parts[3].matches("[a-f0-9-]{36}")?List.of(parts[3]):List.<String>of();feed.committed(kind,ids,MDC.get("requestId"));}
        if(path.matches("/api/resources/[^/]+/tags/[^/]+"))feed.committed("tags",List.of(),MDC.get("requestId"));
    }
}
