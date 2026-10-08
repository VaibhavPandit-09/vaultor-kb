package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ResourceDiscoveryTest {
 static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-discovery-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired TransferService transfers;@Autowired tools.jackson.databind.ObjectMapper json;
 @Autowired ResourceService service;@Autowired FileImportService imports;@Autowired ResourceBrowseService browse;@Autowired OrganizationService organization;@Autowired ResourceSearchService search;
 @Autowired ResourceReferences refs;@Autowired ResourceLifecycleService lifecycle;@Autowired ResourceRepository resources;@Autowired ImageService images;@Autowired FileStorageService files;
 String empty="{\"type\":\"doc\",\"content\":[]}";
 byte[] png(int w,int h)throws Exception{var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();}
 com.vaultor.vaultor.model.Resource image(String title)throws Exception{return imports.create(UUID.randomUUID().toString(),title,null,new MockMultipartFile("file","wrong.pdf","application/pdf",png(700,350)));}
 ResourceLifecycleService.Item item(String id,String action){return new ResourceLifecycleService.Item(UUID.randomUUID().toString(),id,action,resources.findById(id).orElseThrow().getRevision());}
 @Test void categoryPagesCountsPinsAndSavedSearchStayScoped()throws Exception{
  String q="Categories "+UUID.randomUUID();var first=image(q+" A");var second=image(q+" B");service.createNote(q+" Note",empty);
  assertEquals("image/png",first.getMimeType());browse.favorite(first.getId(),true);browse.favorite(second.getId(),true);
  var collection=organization.save(null,new OrganizationService.CollectionInput(q,true));organization.bulk(new OrganizationService.BulkInput(List.of(first.getId()),"collection",collection.id(),"add"));
  var page=browse.list(0,1,q,"file",List.of(),false,"title",null,"image");assertEquals(2,page.totalItems());assertEquals(2,page.totalPages());assertEquals("image",page.appliedCategory());assertEquals(first.getId(),page.items().getFirst().id());
  assertEquals(second.getId(),browse.list(1,1,q,"file",List.of(),false,"title",null,"image").items().getFirst().id());
  assertEquals(1,browse.list(0,100,q,"file",List.of(),false,"title",collection.id(),"image").totalItems());
  var pins=organization.pins(q,0,1,"file","image");assertEquals(2,pins.totalItems());assertEquals("file",pins.items().getFirst().kind());assertEquals("image",pins.appliedCategory());
  for(int n=0;n<100&&search.status().rebuilding();n++)Thread.sleep(50);
  assertEquals(2,search.search(q,0,20,"file",List.of(),null,true,"image").totalItems());
  assertEquals(0,search.search(q,0,20,"file",List.of(),null,false,"pdf").totalItems());
  lifecycle.apply(item(first.getId(),"trash"));assertEquals(1,organization.pins(q,0,20,"file","image").totalItems());lifecycle.apply(item(first.getId(),"restore"));assertEquals(2,browse.list(0,100,q,"file",List.of(),false,"title",null,"image").totalItems());
  assertThrows(IllegalArgumentException.class,()->browse.list(0,100,"","file",List.of(),false,"title",null,"bogus"));
 }
 @Test void referencesSeparateSourcesOccurrencesCyclesAndUnavailableTargets()throws Exception{
  var target=image("References image");var note=service.createNote("Reference note",empty);String missing=UUID.randomUUID().toString();
  String content="{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+target.getId()+"\",\"type\":\"file\",\"label\":\"Saved label\"}},{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+note.getId()+"\",\"type\":\"note\",\"label\":\"Cycle\"}},{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+missing+"\",\"type\":\"note\",\"label\":\"Missing label\"}}]},{\"type\":\"image\",\"attrs\":{\"resourceId\":\""+target.getId()+"\",\"caption\":\"Caption\"}},{\"type\":\"image\",\"attrs\":{\"resourceId\":\""+target.getId()+"\"}}]}";
  service.updateNote(note.getId(),note.getTitle(),content);
  var incoming=refs.list(target.getId(),"incoming",0,1);assertEquals(1,incoming.totalItems());assertEquals(3,incoming.totalOccurrences());var row=incoming.items().getFirst();assertEquals(2,row.images());assertEquals(1,row.fileLinks());assertEquals("/0/0",row.occurrences().getFirst().path());assertNotNull(row.revision());
  var outgoing=refs.list(note.getId(),"outgoing",0,100);assertEquals(3,outgoing.totalItems());assertEquals(5,outgoing.totalOccurrences());assertTrue(outgoing.items().stream().anyMatch(r->!r.available()&&r.title().equals("Missing label")));
  lifecycle.apply(item(target.getId(),"trash"));assertTrue(refs.list(note.getId(),"outgoing",0,100).items().stream().anyMatch(r->r.id().equals(target.getId())&&r.trashed()&&!r.available()));
  lifecycle.apply(item(target.getId(),"restore"));lifecycle.apply(item(note.getId(),"trash"));assertEquals(0,refs.list(target.getId(),"incoming",0,100).totalItems());lifecycle.apply(item(note.getId(),"restore"));assertEquals(1,refs.list(target.getId(),"incoming",0,100).totalItems());
  assertThrows(IllegalArgumentException.class,()->refs.list(target.getId(),"incoming",0,101));
 }
 @Test void occurrenceListsStayBoundedWhileTotalsRemainAccurate(){
  var target=service.createNote("Many occurrences",empty);var nodes=Collections.nCopies(25,"{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+target.getId()+"\",\"type\":\"note\",\"label\":\"Repeated\"}}");
  service.createNote("Many source","{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":["+String.join(",",nodes)+"]}]}");
  var page=refs.list(target.getId(),"incoming",0,30);assertEquals(25,page.totalOccurrences());assertEquals(20,page.items().getFirst().occurrences().size());assertEquals(25,page.items().getFirst().noteLinks());
 }
 @Test void staticThumbnailsRespectBoundsAndOriginalBytes()throws Exception{
  var resource=image("Thumbnail");byte[] original=Files.readAllBytes(files.getFile(resource.getFilePath())),thumb=images.thumbnail(resource.getId());var frame=ImageIO.read(new ByteArrayInputStream(thumb));assertTrue(frame.getWidth()<=320&&frame.getHeight()<=320);assertTrue(thumb.length<=384*1024);assertArrayEquals(original,Files.readAllBytes(files.getFile(resource.getFilePath())));
  var invalid=imports.create(UUID.randomUUID().toString(),"False image",null,new MockMultipartFile("file","not.png","image/png","ordinary text".getBytes()));assertEquals("text/plain",invalid.getMimeType());assertThrows(IllegalArgumentException.class,()->images.thumbnail(invalid.getId()));
  Path huge=DATA.resolve("huge.png");try(var file=new RandomAccessFile(huge.toFile(),"rw")){file.setLength(ImageService.MAX_BYTES+1);}assertThrows(IllegalArgumentException.class,()->ImageService.inspect(huge));
 }

 @Test void categoryAndImageReferencesSurviveArchiveMergeAndReplace()throws Exception {
  String title="Portable image "+UUID.randomUUID();var target=image(title);var source=service.createNote(title+" source","{\"type\":\"doc\",\"content\":[{\"type\":\"image\",\"attrs\":{\"resourceId\":\""+target.getId()+"\",\"alt\":\"Portable placement\"}}]}");
  byte[] original=Files.readAllBytes(files.getFile(target.getFilePath()));var export=transfers.export("workspace","zip");awaitTransfer(export.id());byte[] archive=Files.readAllBytes(transfers.download(export.id()));
  var merge=transfers.preview(new MockMultipartFile("file","discovery.zip","application/zip",archive));transfers.commit(merge.operation().id(),"merge");awaitTransfer(merge.operation().id());
  var matches=browse.list(0,100,title,"file",List.of(),false,"title",null,"image");assertEquals(2,matches.totalItems());for(var match:matches.items()){assertEquals(1,refs.list(match.id(),"incoming",0,30).totalItems());assertArrayEquals(original,Files.readAllBytes(files.getFile(resources.findById(match.id()).orElseThrow().getFilePath())));}
  var replace=transfers.preview(new MockMultipartFile("file","discovery.zip","application/zip",archive));transfers.commit(replace.operation().id(),"replace");awaitTransfer(replace.operation().id());assertEquals(1,browse.list(0,100,title,"file",List.of(),false,"title",null,"image").totalItems());assertEquals(source.getId(),refs.list(target.getId(),"incoming",0,30).items().getFirst().id());
 }
 void awaitTransfer(String id)throws Exception {for(int i=0;i<400;i++){var op=transfers.get(id);if(op.status().equals("SUCCEEDED"))return;if(op.status().equals("FAILED"))fail(op.detail());Thread.sleep(25);}fail("Transfer timeout");}
 @Test void boundedMimeInspectionClassifiesSupportedSignaturesAndRejectsFalseClaims()throws Exception {
  var values=Map.of("pdf","%PDF-1.4","audio","RIFF1234WAVEfixture","video","0000ftypisomfixture","text","ordinary utf8 text");
  for(var entry:values.entrySet()){Path path=DATA.resolve(entry.getKey()+".binary");Files.writeString(path,entry.getValue());String expected=Map.of("pdf","application/pdf","audio","audio/wav","video","video/mp4","text","text/plain").get(entry.getKey());assertEquals(expected,FileMime.detect(path,"image/png"));}
  Path binary=DATA.resolve("unknown");Files.write(binary,new byte[]{0,1,2});assertEquals("application/octet-stream",FileMime.detect(binary,"image/png"));
 }
}
