package com.vaultor.vaultor.service;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import java.time.Instant;
import java.security.MessageDigest;
@Component @RequiredArgsConstructor
public class ZipWorkspaceExporter implements WorkspaceExporter {
    private final ObjectMapper mapper;
    @Value("${app.transfer.max-expanded-bytes}") private long maxExpanded;
    @Value("${app.transfer.max-archive-bytes}") private long maxArchive;
    @Value("${app.transfer.max-entries}") private int maxEntries;
    public ExporterRegistry.Format format() { return new ExporterRegistry.Format(ExporterRegistry.Scope.workspace,"zip","application/zip","zip"); }
    public void write(TransferService.Workspace workspace,Map<String,Path> binaries,Path destination) throws Exception {
        byte[] data=mapper.writeValueAsBytes(workspace);
        if(data.length>20*1024*1024 || binaries.size()+2>maxEntries) throw new IllegalArgumentException("Workspace exceeds archive entry/JSON limits");
        long expanded=data.length;for(Path binary:binaries.values()) expanded+=Files.size(binary);
        if(expanded>maxExpanded) throw new IllegalArgumentException("Workspace exceeds expanded archive limit "+maxExpanded);
        Map<String,String> hashes=new LinkedHashMap<>();hashes.put("workspace.json",hash(new ByteArrayInputStream(data)));
        try(var zip=new ZipOutputStream(Files.newOutputStream(destination))) {
            zip.putNextEntry(new ZipEntry("workspace.json"));zip.write(data);zip.closeEntry();
            for(var entry:binaries.entrySet()) {
                try(var input=Files.newInputStream(entry.getValue())) { hashes.put(entry.getKey(),hash(input)); }
                zip.putNextEntry(new ZipEntry(entry.getKey()));Files.copy(entry.getValue(),zip);zip.closeEntry();
            }
            byte[] manifest=mapper.writeValueAsBytes(new TransferService.Manifest(1,Instant.now().toString(),workspace.resources().size(),workspace.tags().size(),hashes));
            if(expanded+manifest.length>maxExpanded) throw new IllegalArgumentException("Workspace exceeds expanded archive limit including manifest");
            zip.putNextEntry(new ZipEntry("manifest.json"));zip.write(manifest);zip.closeEntry();
        }
        if(Files.size(destination)>maxArchive) {Files.delete(destination);throw new IllegalArgumentException("Workspace exceeds compressed archive limit "+maxArchive);}
    }
    private String hash(InputStream input) throws Exception {var digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);return HexFormat.of().formatHex(digest.digest());}
}
