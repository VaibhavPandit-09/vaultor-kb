package com.vaultor.vaultor.config;
import com.vaultor.vaultor.service.WorkspaceGate;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.slf4j.MDC;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.io.IOException;
import java.util.UUID;

@Component @RequiredArgsConstructor @Slf4j
public class RequestLoggingFilter extends OncePerRequestFilter {
    private final WorkspaceGate gate;
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String supplied = req.getHeader("X-Request-ID");
        String id = supplied != null && supplied.matches("[A-Za-z0-9_-]{1,80}") ? supplied : UUID.randomUUID().toString();
        MDC.put("requestId", id); MDC.put("build", "modernization-1");
        res.setHeader("X-Request-ID", id);
        long started = System.nanoTime();
        boolean guarded = req.getRequestURI().matches("/api/(resources|tags|settings|collections|organization)(/.*)?");
        boolean entered = !guarded || gate.enterRequest();
        try {
            if (!entered) {
                res.setStatus(409); res.setContentType("application/problem+json");
                res.getWriter().write("{\"status\":409,\"code\":\"WORKSPACE_BUSY\",\"detail\":\"Workspace maintenance is in progress. Retry shortly.\",\"requestId\":\"" + id + "\"}");
            } else chain.doFilter(req, res);
        } finally {
            if (guarded && entered) gate.leaveRequest();
            if (req.getRequestURI().startsWith("/api/")) log.info("http method={} path={} status={} durationMs={}", req.getMethod(), req.getRequestURI(), res.getStatus(), (System.nanoTime()-started)/1_000_000);
            MDC.clear();
        }
    }
}
