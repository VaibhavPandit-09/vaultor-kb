package com.vaultor.vaultor.service;
import java.nio.file.Path;
import java.util.Map;
public interface WorkspaceExporter {
    ExporterRegistry.Format format();
    void write(TransferService.Workspace workspace, Map<String,Path> binaries, Path destination) throws Exception;
}
