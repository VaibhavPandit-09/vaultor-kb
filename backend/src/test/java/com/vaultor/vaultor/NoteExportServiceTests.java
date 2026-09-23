package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.controller.TransferController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
class NoteExportServiceTests {
    static final Path DATA;
    static {try {DATA=Files.createTempDirectory("vaultor-note-export-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired TransferService transfers;
    @Autowired TransferController controller;
    @Autowired ResourceService resources;
    @Autowired ExporterRegistry exporters;
    @Autowired WorkspaceGate gate;
    static String doc(String text) {return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"}]}]}";}
    TransferService.Operation finish(String id) throws Exception {long end=System.nanoTime()+20_000_000_000L;TransferService.Operation op;do{op=transfers.get(id);if(!List.of("QUEUED","RUNNING").contains(op.status()))return op;Thread.sleep(20);}while(System.nanoTime()<end);fail("Export timed out");return op;}
    @Test void snapshotsBeforeReturningAndUsesDiscoverableFormatsAndDownloadMetadata() throws Exception {
        var note=resources.createNote("workspace",doc("Original snapshot"));
        org.slf4j.MDC.put("requestId","note-export-check");
        var started=transfers.exportNote(note.getId(),"md");org.slf4j.MDC.remove("requestId");
        while(!gate.enterRequest()) Thread.sleep(10);
        try {resources.updateNote(note.getId(),"Changed title",doc("Changed later"));} finally {gate.leaveRequest();}
        var op=finish(started.id());assertEquals("SUCCEEDED",op.status(),op.detail());assertEquals("note-export-check",op.requestId());
        String output=Files.readString(transfers.download(op.id()));assertTrue(output.contains("Original snapshot"));assertFalse(output.contains("Changed later"));assertEquals("workspace.md",op.filename());
        var zip=finish(transfers.exportNote(note.getId(),"md-assets").id());assertEquals("SUCCEEDED",zip.status(),zip.detail());assertTrue(Files.isRegularFile(transfers.download(zip.id())));assertEquals("application/zip",controller.download(zip.id()).getHeaders().getContentType().toString());
        assertEquals(4,exporters.available().stream().filter(f->f.scope()==ExporterRegistry.Scope.notes).count());assertNotNull(exporters.require("workspace","zip"));
        assertThrows(IllegalArgumentException.class,()->transfers.exportNote(note.getId(),"xlsx"));assertThrows(NoSuchElementException.class,()->transfers.exportNote("missing-note","md"));
    }
}

