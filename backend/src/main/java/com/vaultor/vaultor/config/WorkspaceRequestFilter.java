package com.vaultor.vaultor.config;

import com.vaultor.vaultor.service.WorkspaceGate;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.slf4j.MDC;
import java.io.IOException;

/** Authenticate before admission so unapproved requests cannot inspect maintenance state. */
@Component @Order(Ordered.HIGHEST_PRECEDENCE+2)
public class WorkspaceRequestFilter extends OncePerRequestFilter {
    private final WorkspaceGate gate;
    public WorkspaceRequestFilter(WorkspaceGate gate){this.gate=gate;}
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        boolean guarded=req.getRequestURI().matches("/api/(resources|tags|settings|collections|organization|workspace)(/.*)?");
        boolean transfer=!java.util.List.of("GET","HEAD","OPTIONS").contains(req.getMethod()) && req.getRequestURI().matches("/api/(imports|exports|operations)(/.*)?");
        boolean entered=transfer?gate.enterTransferRequest():!guarded || gate.enterRequest();
        try {
            if(!entered){res.setStatus(409);res.setContentType("application/problem+json");res.getWriter().write("{\"status\":409,\"code\":\"WORKSPACE_BUSY\",\"detail\":\"Workspace maintenance is in progress. Retry shortly.\",\"requestId\":\""+MDC.get("requestId")+"\"}");}
            else chain.doFilter(req,res);
        } finally {if(guarded && entered)gate.leaveRequest();if(transfer && entered)gate.leaveTransferRequest();}
    }
}
