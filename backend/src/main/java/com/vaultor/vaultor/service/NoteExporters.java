package com.vaultor.vaultor.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.nio.file.Path;
import java.util.Map;

@Configuration
public class NoteExporters {
    private WorkspaceExporter exporter(NoteRenderer renderer, String format, String mime, String extension) {
        return new WorkspaceExporter() {
            public ExporterRegistry.Format format() { return new ExporterRegistry.Format(ExporterRegistry.Scope.notes, format, mime, extension); }
            public void write(TransferService.Workspace snapshot, Map<String,Path> binaries, Path destination) throws Exception { renderer.write(snapshot, binaries, destination, format); }
        };
    }
    @Bean WorkspaceExporter markdownNoteExporter(NoteRenderer r) { return exporter(r,"md","text/markdown; charset=UTF-8","md"); }
    @Bean WorkspaceExporter markdownAssetsExporter(NoteRenderer r) { return exporter(r,"md-assets","application/zip","zip"); }
    @Bean WorkspaceExporter pdfNoteExporter(NoteRenderer r) { return exporter(r,"pdf","application/pdf","pdf"); }
    @Bean WorkspaceExporter docxNoteExporter(NoteRenderer r) { return exporter(r,"docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document","docx"); }
}
