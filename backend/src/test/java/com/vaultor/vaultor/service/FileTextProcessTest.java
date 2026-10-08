package com.vaultor.vaultor.service;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.encryption.*;
import static org.junit.jupiter.api.Assertions.*;
class FileTextProcessTest {
 public static class Slow {public static void main(String[] args)throws Exception{Thread.sleep(60000);}}
 @Test void extractorTimeoutTerminatesItsOwnedProcess()throws Exception{
  var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),"-cp",System.getProperty("java.class.path"),Slow.class.getName()).redirectError(ProcessBuilder.Redirect.DISCARD).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
  try{assertFalse(FileContentIndex.awaitBounded(process,300));assertFalse(process.isAlive());}finally{process.destroyForcibly();}
 }
 @Test void utf8UnicodeInvalidAndBounds()throws Exception{
  Path p=Files.createTempFile("vaultor-text-test-",".txt");try{
   Files.writeString(p,"Literal AND café 東京 <script>not executed</script>");assertTrue(FileTextProcess.extract(p,"text").text().contains("東京"));
   Files.write(p,new byte[]{(byte)0xff,0});assertEquals("invalid",FileTextProcess.extract(p,"text").state());
   Files.writeString(p,"a".repeat(500_001));assertEquals("limit-exceeded",FileTextProcess.extract(p,"text").state());
   Files.write(p,new byte[(int)FileTextProcess.TEXT_BYTES+1]);assertEquals("limit-exceeded",FileTextProcess.extract(p,"text").state());
  }finally{Files.delete(p);}
 }
 @Test void pdfTextEmptyEncryptedInvalidAndPages()throws Exception{
  Path p=Files.createTempFile("vaultor-pdf-test-",".pdf");try{
   try(var d=new PDDocument()){var page=new PDPage();d.addPage(page);try(var c=new PDPageContentStream(d,page)){c.beginText();c.setFont(new PDType1Font(org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA),12);c.newLineAtOffset(50,700);c.showText("galactic telescope saved body");c.endText();}d.save(p.toFile());}
   assertTrue(FileTextProcess.extract(p,"pdf").text().contains("telescope"));
   try(var d=new PDDocument()){d.addPage(new PDPage());d.save(p.toFile());}assertEquals("no-text",FileTextProcess.extract(p,"pdf").state());
   try(var d=new PDDocument()){d.addPage(new PDPage());d.protect(new StandardProtectionPolicy("owner-secret","user-secret",new AccessPermission()));d.save(p.toFile());}assertEquals("encrypted",FileTextProcess.extract(p,"pdf").state());
   Files.writeString(p,"%PDF-invalid");assertEquals("invalid",FileTextProcess.extract(p,"pdf").state());
   try(var d=new PDDocument()){for(int i=0;i<101;i++)d.addPage(new PDPage());d.save(p.toFile());}assertEquals("limit-exceeded",FileTextProcess.extract(p,"pdf").state());
  }finally{Files.delete(p);}
 }
}
