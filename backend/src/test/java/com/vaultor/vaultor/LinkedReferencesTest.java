package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.ResourceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class LinkedReferencesTest {
    static final Path DATA;
    static {try{DATA=Files.createTempDirectory("vaultor-linked-ref-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.path",()->DATA.resolve("host").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired LinkedReferences linked;
    @Autowired ResourceService resources;
    @Autowired ResourceRepository repository;
    @Autowired OrganizationService organization;
    @Autowired ResourceBrowseService browse;
    @Autowired DocumentService documents;
    @Autowired TransferService transfers;
    @Autowired ZipWorkspaceExporter workspaceZip;
    @Autowired ObjectMapper json;
    tools.jackson.databind.JsonNode reference(){return json.readTree("{\"type\":\"linkedDocument\",\"version\":1,\"sourceId\":\"f931ca63-d694-4e4e-945d-9bf00f7ec742\",\"sourceName\":\"Docs\",\"relativePath\":\"guide/START.md\"}");}
    @Test void metadataReferencesKeepMultipleMembershipsWithoutOwningSourceBytes(){
        String id=UUID.randomUUID().toString();var input=new LinkedReferences.Input("START.md",reference());var resource=linked.register(id,input);
        assertEquals("linked",resource.getType());assertNull(resource.getFilePath());assertNull(resource.getSize());
        String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString();organization.createOnce(a,new OrganizationService.CreationInput("Collection A",List.of(id)));organization.createOnce(b,new OrganizationService.CreationInput("Collection B",List.of(id)));
        assertEquals(2,browse.byIds(List.of(id)).get(id).collections().size());assertEquals(id,linked.register(id,input).getId());assertEquals(2,browse.byIds(List.of(id)).get(id).collections().size());
        var note=resources.createNote("Managed","{\"type\":\"doc\",\"content\":[]}");assertThrows(Exception.class,()->linked.register(note.getId(),input));
    }
    @Test void portableDescriptorsRefuseAbsolutePathsAndEmbeddedContent(){
        for(String path:List.of("C:/private.md","../outside.md","folder/../private.md","\\\\server\\secret.md")){var node=reference().deepCopy();((tools.jackson.databind.node.ObjectNode)node).put("relativePath",path);assertThrows(IllegalArgumentException.class,()->LinkedReferences.validate(node));}
        var node=(tools.jackson.databind.node.ObjectNode)reference();node.put("markdown","private document content");assertThrows(IllegalArgumentException.class,()->LinkedReferences.validate(node));
    }
    @Test void boundedBatchRegistrationIsAtomicAndNeverClaimsManagedResources(){
        var managed=resources.createNote("Existing managed note","{\"type\":\"doc\",\"content\":[]}");long count=repository.count();String created=UUID.randomUUID().toString();
        assertThrows(Exception.class,()->linked.registerMany(List.of(new LinkedReferences.Registration(created,"First.md",reference()),new LinkedReferences.Registration(managed.getId(),"Must refuse",reference()))));
        assertEquals(count,repository.count());assertFalse(repository.existsById(created));
        var result=linked.registerMany(List.of(new LinkedReferences.Registration(created,"Registered.md",reference())));assertEquals(created,result.getFirst().getId());assertNull(result.getFirst().getFilePath());
    }
    @Test void archiveContainsOnlyDependencyDescriptorAndRequiresNewFormat()throws Exception{
        String id=UUID.randomUUID().toString();linked.register(id,new LinkedReferences.Input("External.md",reference()));var op=transfers.export("workspace","zip");
        for(int i=0;i<200&&Set.of("QUEUED","RUNNING").contains(transfers.get(op.id()).status());i++)Thread.sleep(25);
        assertEquals("SUCCEEDED",transfers.get(op.id()).status());try(var zip=new ZipFile(transfers.download(op.id()).toFile())){
            assertEquals(2,zip.size());var manifest=json.readTree(zip.getInputStream(zip.getEntry("manifest.json")).readAllBytes());assertEquals(9,manifest.path("version").asInt());
            var workspace=json.readTree(zip.getInputStream(zip.getEntry("workspace.json")).readAllBytes());var found=new ArrayList<tools.jackson.databind.JsonNode>();workspace.path("resources").forEach(row->{if(row.path("id").asText().equals(id))found.add(row);});assertEquals(1,found.size());assertEquals(reference(),found.getFirst().get("content"));assertTrue(found.getFirst().path("binary").isNull());
        }
    }
    @Test void writerEmitsFullAndPartialLinkedReferenceFixtures() throws Exception {
        var id = "fe621758-438f-4f2f-af47-f1d6679a4853";
        var resource = new TransferService.ResourceData(id,"linked","External.md",reference(),null,null,
                null,null,null,List.of(),null);
        var settings = new SettingsService.WorkspaceSettings(null,null,null,null);
        var workspace = new TransferService.Workspace(List.of(resource),List.of(),settings);
        var coverage = Map.of("version",1,"kind","vaultor-partial","inventory",List.of(
                Map.of("id",id,"title","External.md","type","linked")),"omissions",List.of());
        Path directory = Files.createTempDirectory(DATA,"zip-fixtures-");
        for (int version : List.of(9,10)) {
            String filename = "electron-workspace-v" + version + ".zip";
            Path path = directory.resolve(filename);
            if (version == 9) workspaceZip.write(workspace,Map.of(),path);
            else workspaceZip.writePartial(workspace,Map.of(),path,coverage);
            try (var zip = new ZipFile(path.toFile())) {
                var manifest = json.readTree(zip.getInputStream(zip.getEntry("manifest.json")).readAllBytes());
                assertEquals(version,manifest.path("version").asInt());
                assertEquals(version == 9 ? 2 : 3,zip.size());
                var item = json.readTree(zip.getInputStream(zip.getEntry("workspace.json")).readAllBytes())
                        .path("resources").get(0);
                assertEquals(reference(),item.path("content"));
                assertTrue(item.path("binary").isNull());
            }
            String output = System.getProperty("vaultor.linkedZipFixtures");
            if (output != null) Files.copy(path,Path.of(output).resolve(filename),StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
