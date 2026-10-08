package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.awt.image.BufferedImage;
import javax.imageio.*;
import java.io.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class ImageTests {
 @TempDir Path root;
 @Test void preservesOriginalPngJpegGifAndWebpBytes() throws Exception {
  for(String format:List.of("png","jpeg","gif")) {var path=root.resolve("image."+format);ImageIO.write(new BufferedImage(40,20,BufferedImage.TYPE_INT_RGB),format,path.toFile());var bytes=Files.readAllBytes(path);var info=ImageService.inspect(path);assertEquals(format,info.format());assertEquals(40,info.width());assertEquals(20,info.height());assertFalse(info.animated());assertNotNull(ImageIO.read(new ByteArrayInputStream(ImageService.png(path))));assertArrayEquals(bytes,Files.readAllBytes(path));}
  var path=root.resolve("image.webp");Files.write(path,Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"));assertEquals("webp",ImageService.inspect(path).format());assertNotNull(ImageIO.read(new ByteArrayInputStream(ImageService.png(path))));
 }
 @Test void rejectsBytesFormatsAndOversizedDimensionsBeforeDecode() throws Exception {
  var huge=root.resolve("huge.png");try(var out=new java.io.RandomAccessFile(huge.toFile(),"rw")){out.setLength(ImageService.MAX_BYTES+1);}assertThrows(IllegalArgumentException.class,()->ImageService.inspect(huge));
  var unsupported=root.resolve("other.svg");Files.writeString(unsupported,"<svg/> ");assertThrows(IllegalArgumentException.class,()->ImageService.inspect(unsupported));
  var png=root.resolve("dimensions.png");ImageIO.write(new BufferedImage(1,1,BufferedImage.TYPE_INT_RGB),"png",png.toFile());byte[] bytes=Files.readAllBytes(png);var buffer=java.nio.ByteBuffer.wrap(bytes);buffer.putInt(16,10000);buffer.putInt(20,10000);var crc=new java.util.zip.CRC32();crc.update(bytes,12,17);buffer.putInt(29,(int)crc.getValue());Files.write(png,bytes);assertThrows(IllegalArgumentException.class,()->ImageService.inspect(png));
 }
 @Test void detectsAnimationAndConvertsOnlyFirstFrame() throws Exception {
  var path=root.resolve("animated.gif");var writer=ImageIO.getImageWritersByFormatName("gif").next();try(var out=ImageIO.createImageOutputStream(path.toFile())){writer.setOutput(out);writer.prepareWriteSequence(null);for(int i=0;i<2;i++)writer.writeToSequence(new IIOImage(new BufferedImage(8,8,BufferedImage.TYPE_INT_RGB),null,null),null);writer.endWriteSequence();}finally{writer.dispose();}assertTrue(ImageService.inspect(path).animated());assertEquals(8,ImageIO.read(new ByteArrayInputStream(ImageService.png(path))).getWidth());
 }
 @Test void validatesPortableAttributesAndRemapsResourceReferences() throws Exception {
  var mapper=new ObjectMapper();var docs=new DocumentService(mapper);var node=mapper.readTree("{\"type\":\"doc\",\"content\":[{\"type\":\"image\",\"attrs\":{\"resourceId\":\"old\",\"width\":55,\"alignment\":\"right\",\"caption\":\"Caption\",\"alt\":\"Alternative\"}}]}");docs.validate(node);assertEquals(Set.of("old"),docs.references(node));var remapped=docs.remap(node,Map.of("old","new"));assertEquals(Set.of("new"),new LinkExtractionService(mapper).extractLinks(remapped.toString()));assertEquals(55,remapped.path("content").get(0).path("attrs").path("width").asInt());assertThrows(IllegalArgumentException.class,()->docs.validate(mapper.readTree(node.toString().replace("\"resourceId\":\"old\"","\"src\":\"data:image/png;base64,a\""))));
 }
 @Test void rendersImageSizingCaptionsOriginalAssetsAndAnimatedWarning() throws Exception {
  var mapper=new ObjectMapper();var docs=new DocumentService(mapper);var renderer=new NoteRenderer(docs,mapper);var image=root.resolve("asset.gif");var writer=ImageIO.getImageWritersByFormatName("gif").next();try(var out=ImageIO.createImageOutputStream(image.toFile())){writer.setOutput(out);writer.prepareWriteSequence(null);for(int i=0;i<2;i++)writer.writeToSequence(new IIOImage(new BufferedImage(160,80,BufferedImage.TYPE_INT_RGB),null,null),null);writer.endWriteSequence();}writer.dispose();var original=Files.readAllBytes(image);
  var doc=mapper.readTree("{\"type\":\"doc\",\"content\":[{\"type\":\"image\",\"attrs\":{\"resourceId\":\"asset\",\"alt\":\"Screenshot\",\"caption\":\"Caption preserved\",\"width\":40,\"alignment\":\"right\"}}]}");var note=new TransferService.ResourceData("note","note","Images",doc,null,null,null,null,null,List.of(),null);var file=new TransferService.ResourceData("asset","file","asset.gif",null,"image/gif",(long)original.length,null,null,null,List.of(),"assets/asset.gif");var workspace=new TransferService.Workspace(List.of(note,file),List.of(),null);var binaries=Map.of("assets/asset.gif",image);
  var pdf=root.resolve("note.pdf");renderer.write(workspace,binaries,pdf,"pdf");try(var loaded=org.apache.pdfbox.Loader.loadPDF(pdf.toFile())){assertTrue(new org.apache.pdfbox.text.PDFTextStripper().getText(loaded).contains("Caption preserved"));assertNotNull(loaded.getPage(0).getResources().getXObjectNames().iterator().next());}assertTrue(Files.readString(root.resolve("warnings.json")).contains("first frame"));
  var word=root.resolve("note.docx");renderer.write(workspace,binaries,word,"docx");try(var loaded=new org.apache.poi.xwpf.usermodel.XWPFDocument(Files.newInputStream(word))){assertEquals(1,loaded.getAllPictures().size());assertTrue(loaded.getParagraphs().stream().anyMatch(p->p.getText().contains("Caption preserved")));assertEquals(org.apache.poi.xwpf.usermodel.ParagraphAlignment.RIGHT,loaded.getParagraphs().get(1).getAlignment());}
  renderer.write(workspace,binaries,root.resolve("note.md"),"md");assertTrue(Files.readString(root.resolve("note.md")).contains("vaultor:resource/asset"));renderer.write(workspace,binaries,root.resolve("note.zip"),"md-assets");try(var zip=new java.util.zip.ZipFile(root.resolve("note.zip").toFile())){assertArrayEquals(original,zip.getInputStream(zip.getEntry("assets/asset.gif")).readAllBytes());}
 }
}
