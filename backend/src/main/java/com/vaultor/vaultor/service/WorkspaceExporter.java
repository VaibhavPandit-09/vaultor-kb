package com.vaultor.vaultor.service;
import java.nio.file.Path;
import java.util.Map;
public interface WorkspaceExporter {
    ExporterRegistry.Format format();
    void write(TransferService.Workspace workspace, Map<String,Path> binaries, Path destination) throws Exception;
    default void writeNote(TransferService.Workspace snapshot, Map<String,Path> binaries, Path destination, boolean linked, boolean references) throws Exception { write(snapshot,binaries,destination); }
}
