package com.vaultor.vaultor.service;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class ExporterRegistry {
    public enum Scope { workspace, notes, table }
    public record Format(Scope scope,String format,String mediaType,String extension) {}
    private final Map<String,WorkspaceExporter> exporters=new LinkedHashMap<>();
    public ExporterRegistry(List<WorkspaceExporter> implementations) {
        for(var exporter:implementations) {
            var format=exporter.format();
            if(exporters.put(format.scope()+":"+format.format(),exporter)!=null) throw new IllegalStateException("Duplicate exporter");
        }
    }
    public List<Format> available() { return exporters.values().stream().map(WorkspaceExporter::format).toList(); }
    public WorkspaceExporter require(String scope,String format) {
        var result=exporters.get(scope+":"+format);
        if(result==null) throw new IllegalArgumentException("Unsupported export scope/format"); return result;
    }
}
