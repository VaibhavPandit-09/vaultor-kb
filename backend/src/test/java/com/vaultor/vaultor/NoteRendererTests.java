package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import tools.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.rendering.PDFRenderer;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import static org.junit.jupiter.api.Assertions.*;

class NoteRendererTests {
    final ObjectMapper mapper=new ObjectMapper();
    final DocumentService documents=new DocumentService(mapper);
    @Test void rendersAllFormatsWithStructuredContentAssetsAndWarnings() throws Exception {
        Path root=Path.of("target/note-export-review");Files.createDirectories(root.resolve("assets"));
        var image=new BufferedImage(240,80,BufferedImage.TYPE_INT_RGB);var g=image.createGraphics();g.setColor(java.awt.Color.WHITE);g.fillRect(0,0,240,80);g.setColor(java.awt.Color.BLUE);g.drawString("Local image asset",30,40);g.dispose();ImageIO.write(image,"png",root.resolve("assets/image.png").toFile());
        JsonNode content=mapper.readTree("""
        {"type":"doc","content":[
          {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Worker sharing and portability"}]},
          {"type":"paragraph","content":[{"type":"text","text":"Café α × β — Unicode; ","marks":[{"type":"bold"}]},{"type":"text","text":"italic and underlined","marks":[{"type":"italic"},{"type":"underline"},{"type":"highlight"}]},{"type":"text","text":" plus old text","marks":[{"type":"strike"}]}]},
          {"type":"orderedList","attrs":{"start":3},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Allocate one worker per category"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Distribute the remainder"}]}]}]},
          {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Preserve checked task"}]}]}]},
          {"type":"codeBlock","attrs":{"language":"text"},"content":[{"type":"text","text":"Additional share = R × demand / total\\nNested fence: ``` keeps its content"}]},
          {"type":"table","content":[
            {"type":"tableRow","content":[{"type":"tableHeader","attrs":{"colspan":2},"content":[{"type":"paragraph","content":[{"type":"text","text":"Allocation"}]}]},{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Backlog"}]}]}]},
            {"type":"tableRow","content":[{"type":"tableCell","attrs":{"rowspan":2},"content":[{"type":"paragraph","content":[{"type":"text","text":"Manual"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Current"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"1"}]}]}]},
            {"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"2"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"3"}]}]}]}
          ]},
          {"type":"paragraph","content":[{"type":"resourceLink","attrs":{"resourceId":"missing","label":"Related note"}}]},
          {"type":"image","attrs":{"resourceId":"image","alt":"Local example"}},
          {"type":"paragraph","content":[{"type":"text","text":"Reference site","marks":[{"type":"link","attrs":{"href":"https://example.org"}}]}]}
        ]}
        """);
        var note=new TransferService.ResourceData("note","note","Export review",content,null,null,null,null,null,List.of(),null);
        var asset=new TransferService.ResourceData("image","file","image.png",null,"image/png",Files.size(root.resolve("assets/image.png")),null,null,null,List.of(),"assets/image.png");
        var workspace=new TransferService.Workspace(List.of(note,asset),List.of(),null);
        var renderer=new NoteRenderer(documents,mapper);var binaries=Map.of("assets/image.png",root.resolve("assets/image.png"));
        for(String format:List.of("md","md-assets","pdf","docx")) {
            String ext=format.equals("md-assets")?"zip":format;Path output=root.resolve("review."+ext);renderer.write(workspace,binaries,output,format);assertTrue(Files.size(output)>100);
        }
        String md=Files.readString(root.resolve("review.md"));assertTrue(md.contains("3. Allocate"));assertTrue(md.contains("rowspan=\"2\""));assertTrue(md.contains("````text"));assertTrue(md.contains("[x]"));
        try(var zip=new ZipFile(root.resolve("review.zip").toFile())) { assertNotNull(zip.getEntry("assets/image.png"));assertTrue(new String(zip.getInputStream(zip.getEntry("note.md")).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).contains("assets/image.png")); }
        try(var doc=new XWPFDocument(Files.newInputStream(root.resolve("review.docx")))) { assertEquals(1,doc.getTables().size());assertEquals(1,doc.getAllPictures().size());assertTrue(doc.getTables().getFirst().getRow(0).isRepeatHeader());assertEquals(2,doc.getTables().getFirst().getRow(0).getCell(0).getCTTc().getTcPr().getGridSpan().getVal().intValue()); }
        try(var pdf=Loader.loadPDF(root.resolve("review.pdf").toFile())) {var text=new PDFTextStripper().getText(pdf);assertTrue(text.contains("Allocation"));assertTrue(text.contains("Café"));var render=new PDFRenderer(pdf);for(int i=0;i<pdf.getNumberOfPages();i++)ImageIO.write(render.renderImageWithDPI(i,110),"png",root.resolve("pdf-page-"+(i+1)+".png").toFile());}
        assertTrue(Files.readString(root.resolve("warnings.json")).contains("missing"));
    }
}
