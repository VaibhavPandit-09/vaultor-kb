package com.vaultor.vaultor.config;
import com.vaultor.vaultor.service.BuildInformation;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.slf4j.MDC;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.io.IOException;
import java.util.UUID;

@Component @RequiredArgsConstructor @Slf4j @org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {
    private final BuildInformation build;
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String supplied = req.getHeader("X-Request-ID");
        String id = supplied != null && supplied.matches("[A-Za-z0-9_-]{1,80}") ? supplied : UUID.randomUUID().toString();
        MDC.put("requestId", id); MDC.put("build", build.version());
        res.setHeader("X-Request-ID", id);
        long started = System.nanoTime();
        try {
            chain.doFilter(req, res);
        } finally {
            if (req.getRequestURI().startsWith("/api/")) log.info("http method={} path={} status={} durationMs={}", req.getMethod(), req.getRequestURI(), res.getStatus(), (System.nanoTime()-started)/1_000_000);
            MDC.clear();
        }
    }
}
