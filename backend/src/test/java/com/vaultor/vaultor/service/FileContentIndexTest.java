package com.vaultor.vaultor.service;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
class FileContentIndexTest {
 static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-file-search-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired FileContentIndex index;@Autowired ResourceSearchService search;@Autowired FileImportService imports;@Autowired ResourceService notes;@Autowired ResourceBrowseService browse;@Autowired JdbcTemplate jdbc;@Autowired OrganizationService organization;@Autowired WorkspaceIdentityService identity;@Autowired ResourceLifecycleService lifecycle;
 @Autowired TransferService transfers;@Autowired com.vaultor.vaultor.repository.ResourceRepository resources;
 @Autowired FileStorageService files;
 void ready()throws Exception{for(int i=0;i<100&&search.status().rebuilding();i++)Thread.sleep(50);assertFalse(search.status().rebuilding());}
 void drain()throws Exception{ready();for(int i=0;i<40;i++){var c=index.coverage("",List.of());if(c.queued()+c.indexing()==0)return;index.tick();}fail("Files did not settle");}
 byte[] pdf()throws Exception{try(var d=new PDDocument();var out=new ByteArrayOutputStream()){var p=new PDPage();d.addPage(p);try(var c=new PDPageContentStream(d,p)){c.beginText();c.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);c.newLineAtOffset(50,700);c.showText("Nebulaquartz telescope saved PDF body");c.endText();}d.save(out);return out.toByteArray();}}
 @Test void subprocessSearchRankingScopeCoverageAndOriginals()throws Exception{
  ready();var p=imports.create(UUID.randomUUID().toString(),"Neutral PDF",null,new MockMultipartFile("file","test.pdf","application/pdf",pdf()));
  var text=imports.create(UUID.randomUUID().toString(),"Neutral text",null,new MockMultipartFile("file","test.txt","text/plain","Nebulaquartz café 東京 <script>literal</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  var n=notes.createNote("Nebulaquartz", "{\"type\":\"doc\",\"content\":[]}");
  var bad=imports.create(UUID.randomUUID().toString(),"Binary",null,new MockMultipartFile("file","test.bin","application/octet-stream",new byte[]{0,1,2}));
  drain();assertEquals(0,index.coverage("",List.of()).failed());assertEquals(1,index.coverage("",List.of()).unsupported());
  assertEquals(0,browse.list(0,100,"Nebulaquartz","file",List.of(),false,"title",null).totalItems());
  var result=search.search("Nebulaquar",0,100,null,List.of(),null,false);assertEquals(3,result.totalItems());assertEquals(n.getId(),result.items().getFirst().resource().id());assertTrue(result.items().stream().anyMatch(h->h.snippet().text().contains("saved PDF")));assertNotNull(result.fileCoverage());
  assertEquals(1,search.search("東京",0,100,"file",List.of(),null,false,"text").totalItems());
  var c=organization.save(null,new OrganizationService.CollectionInput("Scope",false));organization.bulk(new OrganizationService.BulkInput(List.of(p.getId()),"collection",c.id(),"add"));drain();
  assertEquals(1,search.search("Nebulaquartz",0,100,null,List.of(),c.id(),false).totalItems());assertEquals(1,search.search("Nebulaquartz",0,100,null,List.of(),c.id(),false).fileCoverage().files());
  browse.favorite(text.getId(),true);drain();assertEquals(1,search.search("Nebulaquartz",0,100,null,List.of(),null,true).totalItems());
  assertEquals(0,search.search("Nebulaquartz AND impossible",0,100,null,List.of(),null,false).totalItems());assertEquals("unsupported",index.jobs(0,100).items().stream().filter(j->j.id().equals(bad.getId())).findFirst().orElseThrow().state());
 }
 @Test void sourceGenerationAndRebuildDiscardStaleResults()throws Exception{
  ready();var r=imports.create(UUID.randomUUID().toString(),"Stale text",null,new MockMultipartFile("file","test.txt","text/plain","Chronosignal unique body".getBytes()));drain();
  String version=jdbc.queryForObject("select "+FileContentIndex.VERSION+" from resources r where id=?",String.class,r.getId());String generation=identity.current().generation();
  var job=new FileContentIndex.Job(r.getId(),r.getFilePath(),r.getMimeType(),r.getSize(),version,generation);
  notes.rename(r.getId(),"Renamed","\""+r.getRevision()+"\"");
  index.publish(job,new FileTextProcess.Result("indexed","staleghost","test"),"hash");assertEquals(0,search.search("staleghost",0,100,null,List.of(),null,false).totalItems());drain();
  identity.replaced();assertEquals(0,search.search("Chronosignal",0,100,null,List.of(),null,false).totalItems());index.publish(job,new FileTextProcess.Result("indexed","staleghost","test"),"hash");drain();assertEquals(1,search.search("Chronosignal",0,100,null,List.of(),null,false).totalItems());
  search.rebuild("test");drain();assertEquals(1,search.search("Chronosignal",0,100,null,List.of(),null,false).totalItems());
  var current=resources.findById(r.getId()).orElseThrow();lifecycle.apply(new ResourceLifecycleService.Item(UUID.randomUUID().toString(),r.getId(),"trash",current.getRevision()));assertEquals(0,search.search("Chronosignal",0,100,null,List.of(),null,false).totalItems());
  current=resources.findById(r.getId()).orElseThrow();lifecycle.apply(new ResourceLifecycleService.Item(UUID.randomUUID().toString(),r.getId(),"restore",current.getRevision()));drain();assertEquals(1,search.search("Chronosignal",0,100,null,List.of(),null,false).totalItems());
 }
 @Test void archivesRebuildDerivedTextAfterMergeAndReplace()throws Exception{
  ready();String word="Portablesignal"+UUID.randomUUID().toString().replace("-","");imports.create(UUID.randomUUID().toString(),"Portable text",null,new MockMultipartFile("file","portable.txt","text/plain",word.getBytes()));drain();
  var export=transfers.export("workspace","zip");await(export.id());byte[] zip=Files.readAllBytes(transfers.download(export.id()));
  var merge=transfers.preview(new MockMultipartFile("file","search.zip","application/zip",zip));transfers.commit(merge.operation().id(),"merge");await(merge.operation().id());drain();assertEquals(2,search.search(word,0,100,"file",List.of(),null,false).totalItems());
  var replace=transfers.preview(new MockMultipartFile("file","search.zip","application/zip",zip));transfers.commit(replace.operation().id(),"replace");await(replace.operation().id());drain();assertEquals(1,search.search(word,0,100,"file",List.of(),null,false).totalItems());
 }
 @Test void missingBytesFailLocallyAndRetryWithoutChangingOriginalIdentity()throws Exception{
  ready();String word="Recoverytext"+UUID.randomUUID().toString().replace("-","");var r=imports.create(UUID.randomUUID().toString(),"Missing bytes",null,new MockMultipartFile("file","missing.txt","text/plain",word.getBytes()));drain();
  Path path=files.getFile(r.getFilePath());byte[] original=Files.readAllBytes(path);Files.delete(path);index.retry(r.getId());drain();assertEquals("failed",index.jobs(0,100).items().stream().filter(e->e.id().equals(r.getId())).findFirst().orElseThrow().state());assertEquals(0,search.search(word,0,100,null,List.of(),null,false).totalItems());
  Files.write(path,original);index.retry(r.getId());drain();assertEquals(1,search.search(word,0,100,null,List.of(),null,false).totalItems());assertArrayEquals(original,Files.readAllBytes(path));
 }
 void await(String id)throws Exception{for(int i=0;i<400;i++){var op=transfers.get(id);if(op.status().equals("SUCCEEDED"))return;if(op.status().equals("FAILED"))fail(op.detail());Thread.sleep(25);}fail("Transfer timeout");}
}
