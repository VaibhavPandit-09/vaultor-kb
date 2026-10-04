package com.vaultor.vaultor.host;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.boot.web.server.servlet.context.ServletWebServerInitializedEvent;
import org.springframework.boot.tomcat.TomcatWebServer;
import org.apache.catalina.connector.Connector;
import org.apache.tomcat.util.net.*;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;

@Service
public class HostListener {
    private final HostAccess access;private final ObjectMapper json;private final int port;private final int formLimit;
    private TomcatWebServer server;private Connector network;
    private boolean enabled;
    public HostListener(HostAccess access,ObjectMapper json,@Value("${app.host.network-port}") int port,@Value("${spring.servlet.multipart.max-request-size}") String formSize) throws Exception {
        this.access=access;this.json=json;this.port=port;
        this.formLimit=(int)Math.min(Integer.MAX_VALUE,org.springframework.util.unit.DataSize.parse(formSize).toBytes());
        if(port<0 || port>65535) throw new IllegalArgumentException("Invalid network port");
        var config=access.directory.resolve("sharing.json");
        if(Files.exists(config)) {var tree=json.readTree(Files.readAllBytes(config));if(tree.path("version").asInt()!=1 || !tree.path("enabled").isBoolean()) throw new IllegalStateException("Host sharing configuration is damaged");enabled=tree.path("enabled").asBoolean();}
    }
    @EventListener public synchronized void ready(ServletWebServerInitializedEvent event) throws Exception {
        if(event.getWebServer() instanceof TomcatWebServer tomcat){server=tomcat;if(enabled) start();}
    }
    private void start() throws Exception {
        access.trust.renew(false);
        var connector=new Connector("org.apache.coyote.http11.Http11NioProtocol");connector.setPort(port);connector.setScheme("https");connector.setSecure(true);
        connector.setProperty("address","0.0.0.0");connector.setProperty("SSLEnabled","true");connector.setProperty("maxThreads","32");connector.setProperty("maxConnections","128");connector.setProperty("connectionTimeout","10000");connector.setMaxPostSize(formLimit);
        var ssl=new SSLHostConfig();ssl.setProtocols("TLSv1.2,+TLSv1.3");
        var cert=new SSLHostConfigCertificate(ssl,SSLHostConfigCertificate.Type.RSA);
        cert.setCertificateKeystore(access.trust.store);cert.setCertificateKeystorePassword(new String(access.trust.password));cert.setCertificateKeyAlias("server");ssl.addCertificate(cert);connector.addSslHostConfig(ssl);
        try {server.getTomcat().getService().addConnector(connector);if(connector.getLocalPort()<=0) throw new IllegalStateException("HTTPS connector did not start");network=connector;}
        catch(Exception failure){server.getTomcat().getService().removeConnector(connector);connector.destroy();throw new AccessFailure(503,"HOST_TLS_UNAVAILABLE","HTTPS listener could not start. Check the port and host trust files.");}
    }
    private void stop() throws Exception {if(network!=null){var old=network;network=null;server.getTomcat().getService().removeConnector(old);old.stop();old.destroy();}}
    public synchronized Map<String,Object> status(){return Map.of("enabled",enabled,"listening",network!=null,"port",network==null?port:network.getLocalPort());}
    public synchronized boolean network(int localPort){return network!=null && network.getLocalPort()==localPort;}
    public synchronized Map<String,Object> set(boolean value) throws Exception {
        if(server==null) throw new AccessFailure(503,"HOST_NOT_READY","The host is still starting. Retry shortly.");
        if(value==enabled && value==(network!=null)) return status();
        if(value) start();else stop();
        try{HostFiles.write(access.directory.resolve("sharing.json"),json.writeValueAsBytes(Map.of("version",1,"enabled",value)));enabled=value;}
        catch(Exception failure){if(value)stop();enabled=false;throw new AccessFailure(503,"HOST_CONFIG_WRITE_FAILED",value?"Sharing is off because its configuration could not be saved. Check storage and retry.":"Sharing is off for this process, but the preference could not be saved. Fix storage and disable again before restarting; the previous preference may return.");}
        return status();
    }
    public synchronized Map<String,Object> renew() throws Exception {
        access.trust.renew(true);
        if(network!=null) ((org.apache.coyote.http11.AbstractHttp11Protocol<?>)network.getProtocolHandler()).reloadSslHostConfigs();
        return Map.of("fingerprint",access.trust.fingerprint(),"sharing",status());
    }
}
