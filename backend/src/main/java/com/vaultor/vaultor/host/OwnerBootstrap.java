package com.vaultor.vaultor.host;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** Explicit local command; the printed fragment is a one-use ticket, never the owner credential. */
public final class OwnerBootstrap {
    public static boolean run(String[] args) {
        String address=Arrays.stream(args).filter(a->a.startsWith("--owner-bootstrap=")).map(a->a.substring(18)).findFirst().orElse(null);
        if(address==null)return false;
        try {
            URI origin=URI.create(address);
            if(!"http".equals(origin.getScheme()) || !Set.of("localhost","127.0.0.1","[::1]","::1").contains(origin.getHost()) || origin.getUserInfo()!=null || origin.getQuery()!=null || origin.getFragment()!=null || !Set.of("","/").contains(origin.getPath()))throw new IllegalArgumentException();
            String path=Arrays.stream(args).filter(a->a.startsWith("--host-access=")).map(a->a.substring(14)).findFirst().orElse(System.getenv().getOrDefault("HOST_ACCESS_PATH","./data/host-access"));
            String key=Files.readString(Path.of(path).resolve("owner.key"));
            var req=HttpRequest.newBuilder(origin.resolve("/api/owner/browser-ticket")).timeout(java.time.Duration.ofSeconds(10)).header("X-Vaultor-Owner",key).POST(HttpRequest.BodyPublishers.noBody()).build();
            var response=HttpClient.newHttpClient().send(req,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)throw new IllegalStateException();
            String ticket=new ObjectMapper().readTree(response.body()).path("ticket").asText();if(!ticket.matches("[a-f0-9]{64}"))throw new IllegalStateException();
            System.out.println(origin.resolve("/access")+"#ticket="+ticket);
        } catch(Exception failure){throw new IllegalStateException("Owner browser handoff failed. Check the loopback URL, running server and local host-access directory.");}
        return true;
    }
}
