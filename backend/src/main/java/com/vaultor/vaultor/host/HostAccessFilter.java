package com.vaultor.vaultor.host;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.*;
import java.util.*;
import org.slf4j.MDC;

@Component @Order(Ordered.HIGHEST_PRECEDENCE+1)
public class HostAccessFilter extends OncePerRequestFilter {
    public static final String PRINCIPAL="vaultor.hostPrincipal";
    private final HostAccess access;private final HostListener listener;private final ObjectMapper json;
    public HostAccessFilter(HostAccess access,HostListener listener,ObjectMapper json){this.access=access;this.listener=listener;this.json=json;}
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws IOException,ServletException {
        res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");
        try {
            boolean sharedPort=listener.network(req.getLocalPort());
            // A draining/failed TLS connector can never fall back to the owner role.
            boolean network=req.isSecure() || sharedPort;
            if(network && !sharedPort)throw new AccessFailure(503,"SHARING_UNAVAILABLE","The shared listener is stopping. Reconnect after sharing is enabled.");
            if(network && (!req.isSecure() || !HostAccess.privateAddress(InetAddress.getByName(req.getRemoteAddr())))) throw new AccessFailure(403,"LAN_ACCESS_ONLY","This host accepts private-network connections only.");
            String name=req.getServerName();
            if(!network && !Set.of("localhost","127.0.0.1","[::1]","::1").contains(name)) throw new AccessFailure(403,"OWNER_ORIGIN_REQUIRED","Use the loopback address for local owner access.");
            // Compare origins against the actual connector, never proxy-supplied forwarding headers.
            String origin=req.getHeader("Origin");
            String expected=(network?"https":"http")+"://"+name+(req.getServerPort()==(network?443:80)?"":":"+req.getServerPort());
            if(origin!=null && !origin.equals(expected)) throw new AccessFailure(403,"ORIGIN_REJECTED","Use this host's same-origin browser interface.");
            String path=req.getServletPath();if(path.isEmpty())path=req.getRequestURI();
            // Reject ambiguous encodings rather than letting filter and MVC interpret different paths.
            if(req.getRequestURI().contains("%") || path.contains(";") || path.contains("\\")) throw new AccessFailure(400,"INVALID_ACCESS_PATH","Use a canonical application path.");
            boolean read=Set.of("GET","HEAD").contains(req.getMethod());
            if(req.getMethod().equals("OPTIONS")) throw new AccessFailure(403,"CORS_DISABLED","Cross-origin API access is not enabled.");
            boolean publicRead=read && Set.of("/access","/access.html","/access.js","/access.css","/api/access/host","/api/capabilities").contains(path);
            boolean enrollment=network && (path.equals("/api/pairings") && req.getMethod().equals("POST") || path.matches("/api/pairings/[a-f0-9-]{36}") && read || path.matches("/api/pairings/[a-f0-9-]{36}/complete") && req.getMethod().equals("POST"));
            boolean bootstrap=!network && path.equals("/api/access/bootstrap") && req.getMethod().equals("POST");
            if(network && path.equals("/api/access/bootstrap")) throw new AccessFailure(403,"OWNER_CONNECTOR_REQUIRED","Browser owner handoffs can only be redeemed on loopback.");
            if(!network && path.startsWith("/api/pairings")) throw new AccessFailure(403,"HTTPS_PAIRING_REQUIRED","Device enrollment requires the shared HTTPS connection.");
            boolean owner=!network && access.owner(req.getHeader("X-Vaultor-Owner"));
            HostAccess.Device device=null;boolean cookie=false;
            if(!owner) {
                String credential=null;
                if(network){String auth=req.getHeader("Authorization");if(auth!=null && auth.startsWith("Bearer "))credential=auth.substring(7);}
                if(credential==null && req.getCookies()!=null)for(var c:req.getCookies())if(c.getName().equals(network?"__Host-VaultorClient":"VaultorOwner")){credential=c.getValue();cookie=true;break;}
                device=access.authenticate(credential,network);
                if(!network && device!=null && !device.role().equals("OWNER"))device=null;
                owner=!network && device!=null && device.role().equals("OWNER");
            }
            if(path.startsWith("/api/owner/") && !owner) throw new AccessFailure(403,"OWNER_REQUIRED","Manage this host from its local owner connection.");
            if(!publicRead && !enrollment && !bootstrap && !owner && device==null){
                if(read && path.equals("/")){res.sendRedirect("/access");return;}
                throw new AccessFailure(401,"DEVICE_APPROVAL_REQUIRED","This connection needs host approval. Open the host's access page.");
            }
            if(publicRead || enrollment || bootstrap || path.startsWith("/api/owner/")) access.rate(req.getRemoteAddr());
            // The private one-use handoff ticket is the proof for bootstrap, including an already approved browser.
            if(cookie && device!=null && !read && !bootstrap && !enrollment && !HostAccess.same(device.csrf(),req.getHeader("X-Vaultor-CSRF"))) throw new AccessFailure(403,"CSRF_REQUIRED","Refresh this browser's access session and retry.");
            if(device!=null && cookie) cookie(res,network,credential(req,network));
            req.setAttribute(PRINCIPAL,owner?"OWNER":device==null?"PUBLIC":device);
            if(!read && (enrollment || bootstrap || path.startsWith("/api/owner/"))){
                byte[] body=req.getInputStream().readNBytes(16385);if(body.length>16384)throw new AccessFailure(413,"ACCESS_REQUEST_TOO_LARGE","Access requests are limited to 16 KiB.");
                req=new HttpServletRequestWrapper(req){@Override public ServletInputStream getInputStream(){var in=new ByteArrayInputStream(body);return new ServletInputStream(){public int read(){return in.read();}public boolean isFinished(){return in.available()==0;}public boolean isReady(){return true;}public void setReadListener(ReadListener listener){throw new UnsupportedOperationException();}};}@Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),java.nio.charset.StandardCharsets.UTF_8));}};
            }
            chain.doFilter(req,res);
        } catch(AccessFailure failure){
            res.setStatus(failure.status);res.setContentType("application/problem+json");
            res.getWriter().write(json.writeValueAsString(Map.of("status",failure.status,"code",failure.code,"detail",failure.getMessage(),"requestId",Optional.ofNullable(MDC.get("requestId")).orElse(""),"fieldErrors",Map.of())));
        }
    }
    static String credential(HttpServletRequest req,boolean network){if(req.getCookies()!=null)for(var c:req.getCookies())if(c.getName().equals(network?"__Host-VaultorClient":"VaultorOwner"))return c.getValue();return "";}
    static void cookie(HttpServletResponse res,boolean network,String credential){res.addHeader("Set-Cookie",(network?"__Host-VaultorClient":"VaultorOwner")+"="+credential+"; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000"+(network?"; Secure":""));}
}
