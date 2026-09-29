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

    @Test void linkedGraphRejectsChangedPreviewAndFreezesCyclicDiamond() throws Exception {
        var a=resources.createNote("Same title",doc("root"));var b=resources.createNote("Same title",doc("second"));
        var c=resources.createNote("Third",doc("third"));var d=resources.createNote("Fourth",doc("fourth"));
        resources.updateNote(a.getId(),a.getTitle(),links(b.getId(),c.getId()));
        resources.updateNote(b.getId(),b.getTitle(),links(d.getId()));
        resources.updateNote(c.getId(),c.getTitle(),links(d.getId()));
        resources.updateNote(d.getId(),d.getTitle(),links(a.getId(),"missing"));
        var preview=transfers.previewNote(a.getId());assertEquals(4,preview.notes());assertEquals(4,new HashSet<>(preview.noteIds()).size());assertFalse(preview.warnings().isEmpty());
        resources.updateNote(d.getId(),"Renamed",links(a.getId()));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->transfers.exportNote(a.getId(),"md",true,false,preview.fingerprint()));
        var current=transfers.previewNote(a.getId());var started=transfers.exportNote(a.getId(),"md",true,false,current.fingerprint());
        while(!gate.enterRequest())Thread.sleep(10);
        try{resources.updateNote(a.getId(),"Later change",doc("changed after snapshot"));}finally{gate.leaveRequest();}
        var op=finish(started.id());assertEquals("SUCCEEDED",op.status(),op.detail());assertEquals("application/zip",op.mediaType());
        try(var zip=new java.util.zip.ZipFile(transfers.download(op.id()).toFile())) {
            var entries=zip.stream().filter(e->e.getName().endsWith(".md")).toList();assertEquals(4,entries.size());
            String root=new String(zip.getInputStream(entries.getFirst()).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            assertFalse(root.contains("changed after snapshot"));assertTrue(root.contains("note-2-Same_title.md"));assertFalse(root.contains(a.getId()));
        }
    }
    static String links(String... ids) {
        return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":["+Arrays.stream(ids).map(id->"{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+id+"\",\"label\":\"Related note\"}}").collect(java.util.stream.Collectors.joining(","))+"]}]}";
    }

    @Test void packagesOriginalBytesAndRenderedDocumentsFromTheSnapshot() throws Exception {
        var file=resources.uploadFile(new org.springframework.mock.web.MockMultipartFile("file","data.csv","text/csv","original,bytes".getBytes()));
        var note=resources.createNote("Attachments",links(file.getId()));
        for(String format:List.of("pdf","docx")) {
            var preview=transfers.previewNote(note.getId());assertEquals(1,preview.files());
            var started=transfers.exportNote(note.getId(),format,true,false,preview.fingerprint());
            var op=finish(started.id());assertEquals("SUCCEEDED",op.status(),op.detail());assertTrue(op.filename().endsWith(".zip"));
            try(var zip=new java.util.zip.ZipFile(transfers.download(op.id()).toFile())) {
                assertNotNull(zip.getEntry("notes."+format));var asset=zip.stream().filter(e->e.getName().startsWith("assets/")).findFirst().orElseThrow();
                assertEquals("original,bytes",new String(zip.getInputStream(asset).readAllBytes()));
                String metadata=new String(zip.getInputStream(zip.getEntry("export.json")).readAllBytes());assertTrue(metadata.contains("notes."+format+"#note-1"));
            }
        }
    }
}

