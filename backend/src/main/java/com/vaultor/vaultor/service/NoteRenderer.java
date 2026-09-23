package com.vaultor.vaultor.service;

import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import org.apache.poi.xwpf.usermodel.*;
import org.apache.poi.util.Units;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.*;
import java.nio.file.*;
import java.io.*;
import java.math.BigInteger;
import java.util.*;
import java.util.zip.*;
import javax.imageio.ImageIO;

/** Render only structured nodes from the immutable export snapshot, never live editor HTML. */
@Service
public class NoteRenderer {
    private final DocumentService documents;
    private final ObjectMapper mapper;
    public NoteRenderer(DocumentService documents, ObjectMapper mapper) { this.documents=documents; this.mapper=mapper; }
    public void write(TransferService.Workspace snapshot, Map<String,Path> binaries, Path output, String format) throws Exception {
        var context=new Context(snapshot,binaries,format);
        var note=snapshot.resources().getFirst(); documents.validate(note.content());
        String markdown="# "+context.mdText(note.title())+"\n\n";
        switch(format) {
            case "md", "md-assets" -> {
                markdown+=context.md(note.content()).strip()+"\n";
                if(format.equals("md")) Files.writeString(output,markdown);
                else try(var zip=new ZipOutputStream(Files.newOutputStream(output))) {
                    zip.putNextEntry(new ZipEntry("note.md"));zip.write(markdown.getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
                    for(var asset:binaries.entrySet()) { zip.putNextEntry(new ZipEntry(asset.getKey())); Files.copy(asset.getValue(),zip);zip.closeEntry(); }
                    zip.putNextEntry(new ZipEntry("README.txt"));zip.write(("Open note.md with assets/ beside it. Vaultor resource IDs refer to the source workspace, not standalone documents.\n"+String.join("\n",context.warnings)).getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
                }
            }
            case "pdf" -> {
                String body="<h1>"+context.xml(note.title())+"</h1>"+context.html(note.content());
                var builder=new PdfRendererBuilder();
                builder.useFont(()->getClass().getResourceAsStream("/fonts/NotoSans-Regular.ttf"),"Noto Sans",400,FontStyle.NORMAL,true);
                builder.useFont(()->getClass().getResourceAsStream("/fonts/NotoSans-Bold.ttf"),"Noto Sans",700,FontStyle.NORMAL,true);
                builder.useUriResolver((base,uri)->uri.startsWith("data:image/png;base64,") || uri.startsWith("data:image/jpeg;base64,") ? uri : null);
                builder.withHtmlContent("<html><head><meta charset=\"UTF-8\"/><style>"+CSS+"</style></head><body>"+body+"</body></html>",null);
                try(var stream=Files.newOutputStream(output)) { builder.toStream(stream);builder.run(); }
            }
            case "docx" -> {
                try(var doc=new XWPFDocument()) {
                    var section=doc.getDocument().getBody().addNewSectPr();
                    var page=section.addNewPgSz();page.setW(BigInteger.valueOf(11906));page.setH(BigInteger.valueOf(16838));
                    var margin=section.addNewPgMar();margin.setTop(BigInteger.valueOf(1000));margin.setBottom(BigInteger.valueOf(1000));margin.setLeft(BigInteger.valueOf(1000));margin.setRight(BigInteger.valueOf(1000));
                    var title=doc.createParagraph();title.setStyle("Title");title.setSpacingAfter(240);var run=title.createRun();run.setText(note.title());run.setFontSize(24);run.setBold(true);
                    context.docBlocks(doc,note.content(),0,"");
                    try(var out=Files.newOutputStream(output)) { doc.write(out); }
                }
            }
            default -> throw new IllegalArgumentException("Unsupported note format");
        }
        Files.writeString(output.resolveSibling("warnings.json"),mapper.writeValueAsString(context.warnings));
    }
    private static final String CSS="@page { size: A4; margin: 18mm; @bottom-right { content: counter(page); font-size:9pt; } } body { font-family:'Noto Sans'; font-size:10pt; line-height:1.45; color:#172033; } h1 {font-size:22pt;} h2 {font-size:17pt;} h3 {font-size:14pt;} h1,h2,h3 { page-break-after:avoid; } p {margin:0 0 8pt;} table {border-collapse:collapse; width:100%; table-layout:fixed; margin:10pt 0; -fs-table-paginate:paginate;} td,th {border:0.6pt solid #b8c1cd; padding:5pt; vertical-align:top; word-wrap:break-word;} th {background:#edf1f6;} thead {display:table-header-group;} pre {white-space:pre-wrap; word-wrap:break-word; background:#f1f4f8; padding:8pt; font-family:'Noto Sans'; font-size:9pt;} blockquote {border-left:2pt solid #64748b; padding-left:10pt; margin-left:0;} img {max-width:100%; max-height:220mm;} a {color:#1d4ed8;}";
    private static List<JsonNode> children(JsonNode node) { return DocumentService.children(node); }
    private static String type(JsonNode n) { return n.path("type").asText(); }
    private static String text(JsonNode n) { if(n.has("text")) return n.path("text").asText();if(type(n).equals("hardBreak")) return "\n";var out=new StringBuilder();for(var c:children(n)) out.append(text(c));return out.toString(); }
    private static int span(JsonNode cell,String name) { int n=cell.path("attrs").path(name).asInt(1);if(n<1 || n>500) throw new IllegalArgumentException("Invalid table "+name);return n; }
    private static String safeLink(String url) { return url.matches("(?i)^(https?://|mailto:).*" ) ? url : ""; }

    private static class Context {
        final Map<String,TransferService.ResourceData> resources=new LinkedHashMap<>();
        final Map<String,Path> binaries;
        final String format;
        final Set<String> warnings=new LinkedHashSet<>();
        final java.awt.Font font;
        Context(TransferService.Workspace snapshot,Map<String,Path> binaries,String format) throws Exception {
            snapshot.resources().forEach(r->{resources.put(r.id(),r);if("file".equals(r.type()) && r.binary()==null) warn("A referenced file has missing bytes; its label and ID are preserved.");});this.binaries=binaries;this.format=format;
            try(var in=NoteRenderer.class.getResourceAsStream("/fonts/NotoSans-Regular.ttf")) { font=java.awt.Font.createFont(java.awt.Font.TRUETYPE_FONT,in); }
        }
        void warn(String message) { if(warnings.size()<100) warnings.add(message); }
        String xml(String raw) {
            if(format.equals("pdf")) { var result=new StringBuilder();raw.codePoints().forEach(cp->{if(cp=='\n'||cp=='\t'||font.canDisplay(cp))result.appendCodePoint(cp);else {result.append("[U+").append(Integer.toHexString(cp).toUpperCase(Locale.ROOT)).append("]");warn("PDF uses U+ codepoint labels for characters unavailable in its bundled font; Markdown/DOCX retain original text.");}});raw=result.toString(); }
            return raw.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;").replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]","");
        }
        String mdText(String s) { return s.replace("\\","\\\\").replaceAll("([`*_{}\\[\\]<>#|!~])","\\\\$1"); }
        TransferService.ResourceData referenced(JsonNode node) { return resources.get(node.path("attrs").path("resourceId").asText()); }
        String label(JsonNode n) { var r=referenced(n);return n.path("attrs").path("label").asText(r==null?"Missing resource":r.title()); }
        String reference(JsonNode n) {
            var r=referenced(n);String id=n.path("attrs").path("resourceId").asText();
            warn(r==null?"One or more linked resources are missing; their labels and IDs are preserved.":"Vaultor resource references identify the source workspace; linked notes are not included.");
            return label(n)+" ("+(r==null?"missing ":"Vaultor resource ")+id+")";
        }
        String asset(JsonNode n) { var r=referenced(n);return r!=null && r.binary()!=null && binaries.containsKey(r.binary()) ? r.binary() : null; }
        String imageData(JsonNode n) {
            String path=asset(n);if(path==null) { warn("Image unavailable locally; preserved as an image reference. Remote images are not downloaded.");return null; }
            var r=referenced(n);
            if(!List.of("image/png","image/jpeg").contains(r.mimeType())) {warn("Only local PNG/JPEG images embed in PDF/DOCX; other images remain references.");return null;}
            try { if(Files.size(binaries.get(path))>10*1024*1024) {warn("Images over 10 MiB remain references in PDF/DOCX.");return null;}return "data:"+r.mimeType()+";base64,"+Base64.getEncoder().encodeToString(Files.readAllBytes(binaries.get(path))); }
            catch(IOException e) { throw new UncheckedIOException(e); }
        }
        String imageLabel(JsonNode n) { return "Image: "+n.path("attrs").path("alt").asText(n.path("attrs").path("src").asText("local asset")); }
        String html(JsonNode n) {
            String body=List.of("table","codeBlock").contains(type(n)) ? "" : children(n).stream().map(this::html).collect(java.util.stream.Collectors.joining());
            String out=switch(type(n)) {
                case "doc" -> body;
                case "text" -> xml(n.path("text").asText());
                case "paragraph" -> "<p>"+(body.isEmpty()?"<br/>":body)+"</p>";
                case "heading" -> "<h"+Math.clamp(n.path("attrs").path("level").asInt(1),1,6)+">"+body+"</h"+Math.clamp(n.path("attrs").path("level").asInt(1),1,6)+">";
                case "bulletList","taskList" -> "<ul>"+body+"</ul>";
                case "orderedList" -> "<ol start=\""+Math.max(1,n.path("attrs").path("start").asInt(1))+"\">"+body+"</ol>";
                case "listItem" -> "<li>"+body+"</li>";
                case "taskItem" -> "<li>"+body.replaceFirst("<p>","<p>"+(n.path("attrs").path("checked").asBoolean()?"[x] ":"[ ] "))+"</li>";
                case "blockquote" -> "<blockquote>"+body+"</blockquote>";
                case "codeBlock" -> "<pre>"+xml(wrapCode(text(n),85))+"</pre>";
                case "hardBreak" -> "<br/>";
                case "horizontalRule" -> "<hr/>";
                case "resourceLink" -> format.equals("md-assets") && asset(n)!=null ? "<a href=\""+xml(asset(n))+"\">"+xml(label(n))+"</a>" : xml(reference(n));
                case "image" -> { String src=format.equals("md-assets")?asset(n):format.equals("pdf")?imageData(n):null; if(src==null) {warn("Image represented by its reference; use an asset ZIP for local file portability.");yield "<p>"+xml(imageLabel(n))+"</p>";}yield "<img src=\""+xml(src)+"\" alt=\""+xml(imageLabel(n))+"\"/>"; }
                case "table" -> htmlTable(n);
                case "tableRow" -> "<tr>"+body+"</tr>";
                case "tableCell","tableHeader" -> {String tag=type(n).equals("tableHeader")?"th":"td";yield "<"+tag+" colspan=\""+span(n,"colspan")+"\" rowspan=\""+span(n,"rowspan")+"\">"+body+"</"+tag+">";}
                default -> {warn("Unsupported block "+type(n)+" exported using its text/content.");yield body.isEmpty()?xml(text(n)):body;}
            };
            for(JsonNode mark:n.path("marks")) out=switch(type(mark)) {
                case "bold" -> "<strong>"+out+"</strong>";case "italic" -> "<em>"+out+"</em>";case "strike" -> "<s>"+out+"</s>";case "underline" -> "<u>"+out+"</u>";case "code" -> "<code>"+out+"</code>";case "highlight" -> "<span style=\"background-color:#fff2a8\">"+out+"</span>";
                case "link" -> {String url=safeLink(mark.path("attrs").path("href").asText());if(url.isEmpty()) {warn("Unsupported link target preserved as text.");yield out+" ("+xml(mark.path("attrs").path("href").asText())+")";}yield "<a href=\""+xml(url)+"\">"+out+"</a>";}
                default -> {warn("Unsupported mark "+type(mark)+" omitted; text retained.");yield out;}
            };
            return out;
        }
        String htmlTable(JsonNode n) {
            var grid=new Grid(n);
            if(grid.width>8 && format.equals("pdf")) {warn("Tables wider than eight columns are rendered as row records for legibility in PDF/DOCX.");var out=new StringBuilder();for(int r=0;r<grid.height;r++){out.append("<h3>Row ").append(r+1).append("</h3>");for(var cell:grid.cells)if(cell.row==r)out.append("<p><strong>Column ").append(cell.col+1).append(": </strong></p>").append(htmlChildren(cell.node));}return out.toString();}
            var rows=children(n);var out=new StringBuilder("<table>");int i=0;
            while(i<rows.size() && !children(rows.get(i)).isEmpty() && children(rows.get(i)).stream().allMatch(c->type(c).equals("tableHeader") && span(c,"rowspan")==1)) i++;
            if(i>0) {out.append("<thead>");for(int h=0;h<i;h++)out.append(html(rows.get(h)));out.append("</thead>");}
            out.append("<tbody>");for(;i<rows.size();i++)out.append(html(rows.get(i)));return out.append("</tbody></table>").toString();
        }
        String htmlChildren(JsonNode n) { return children(n).stream().map(this::html).collect(java.util.stream.Collectors.joining()); }
        String wrapCode(String s,int width) { return s.lines().map(line->{var b=new StringBuilder();int col=0;for(int cp:line.codePoints().toArray()){if(col++==width){b.append('\n');col=1;}b.appendCodePoint(cp);}return b.toString();}).collect(java.util.stream.Collectors.joining("\n")); }
        String md(JsonNode n) {
            String body=List.of("table","codeBlock","bulletList","orderedList","taskList").contains(type(n)) ? "" : children(n).stream().map(this::md).collect(java.util.stream.Collectors.joining());
            String out=switch(type(n)) {
                case "doc" -> body;case "text" -> mdText(n.path("text").asText());
                case "paragraph" -> body+"\n\n";case "heading" -> "#".repeat(Math.clamp(n.path("attrs").path("level").asInt(1),1,6))+" "+body+"\n\n";
                case "bulletList","orderedList","taskList" -> {var b=new StringBuilder();int index=n.path("attrs").path("start").asInt(1);for(var child:children(n)){String prefix=type(n).equals("orderedList")?(index++)+". ":type(n).equals("taskList")?(child.path("attrs").path("checked").asBoolean()?"- [x] ":"- [ ] "):"- ";String value=md(child).strip();b.append(prefix).append(value.replace("\n","\n"+" ".repeat(prefix.length()))).append('\n');}yield b+"\n";}
                case "listItem","taskItem" -> body;
                case "blockquote" -> "> "+body.strip().replace("\n","\n> ")+"\n\n";
                case "codeBlock" -> {String code=text(n);String fence="```";while(code.contains(fence))fence+="`";String language=n.path("attrs").path("language").asText("").replaceAll("[^A-Za-z0-9_+-]","");yield fence+language+"\n"+code+"\n"+fence+"\n\n";}
                case "hardBreak" -> "  \n";case "horizontalRule" -> "---\n\n";
                case "resourceLink" -> format.equals("md-assets") && asset(n)!=null?"["+mdText(label(n))+"]("+asset(n)+")":mdText(reference(n));
                case "image" -> {String src=format.equals("md-assets")?asset(n):null;if(src==null){warn("Image preserved as a reference; local assets are included only with Markdown + assets ZIP.");yield mdText(imageLabel(n));}yield "!["+mdText(imageLabel(n))+"]("+src+")";}
                case "table" -> {warn("Tables use embedded HTML to preserve spans and rich cells; a Markdown viewer with HTML support is required.");yield html(n)+"\n\n";}
                case "tableRow","tableCell","tableHeader" -> body;
                default -> {warn("Unsupported block "+type(n)+" exported using its text/content.");yield body;}
            };
            for(var mark:n.path("marks")) out=switch(type(mark)) {
                case "bold" -> "**"+out+"**";case "italic" -> "*"+out+"*";case "strike" -> "~~"+out+"~~";
                case "code" -> {String raw=n.path("text").asText();String ticks="`";while(raw.contains(ticks))ticks+="`";yield ticks+" "+raw+" "+ticks;}
                case "underline","highlight" -> {warn("Underline/highlight use embedded HTML in Markdown.");yield type(mark).equals("underline")?"<u>"+out+"</u>":"<mark>"+out+"</mark>";}
                case "link" -> {String raw=mark.path("attrs").path("href").asText();String url=safeLink(raw);yield url.isEmpty()?out+" ("+mdText(raw)+")":"["+out+"](<"+url.replace("<","%3C").replace(">","%3E")+">)";}
                default -> {warn("Unsupported mark "+type(mark)+" omitted; text retained.");yield out;}
            };return out;
        }
        XWPFParagraph paragraph(IBody body) { return body instanceof XWPFDocument d?d.createParagraph():((XWPFTableCell)body).addParagraph(); }
        void docBlocks(IBody body,JsonNode n,int depth,String prefix) throws Exception {
            switch(type(n)) {
                case "doc" -> {for(var c:children(n))docBlocks(body,c,depth,"");}
                case "bulletList","orderedList","taskList" -> {warn("DOCX lists use editable text markers; automatic Word renumbering and interactive task checkboxes are not included.");int i=n.path("attrs").path("start").asInt(1);for(var item:children(n)){String marker=type(n).equals("orderedList")?(i++)+". ":type(n).equals("taskList")?(item.path("attrs").path("checked").asBoolean()?"[x] ":"[ ] "):"• ";boolean first=true;for(var c:children(item)){docBlocks(body,c,depth+1,first?marker:"");first=false;}}}
                case "blockquote" -> {for(var c:children(n))docBlocks(body,c,depth+1,"");}
                case "table" -> {
                    if(body instanceof XWPFDocument d) docTable(d,n);
                    else {warn("Nested tables in DOCX are presented as row records.");docRecords(body,new Grid(n));}
                }
                default -> {
                    var p=paragraph(body);p.setSpacingAfter(120);p.setIndentationLeft(depth*240);p.setSpacingBetween(1.15);
                    if(type(n).equals("heading")){int level=Math.clamp(n.path("attrs").path("level").asInt(1),1,6);p.setStyle("Heading"+level);p.setKeepNext(true);}
                    if(!prefix.isEmpty())p.createRun().setText(prefix);
                    if(type(n).equals("codeBlock")){p.setSpacingBetween(1.0);var r=p.createRun();r.setFontFamily("Consolas");r.setFontSize(9);String[] lines=wrapCode(text(n),85).split("\n",-1);for(int i=0;i<lines.length;i++){if(i>0)r.addBreak();r.setText(lines[i]);}return;}
                    if(type(n).equals("horizontalRule")){p.setBorderBottom(Borders.SINGLE);return;}
                    if(List.of("paragraph","heading").contains(type(n)))for(var c:children(n))docInline(p,c);
                    else docInline(p,n);
                    if(type(n).equals("heading"))for(var r:p.getRuns()){r.setBold(true);r.setFontSize(Math.max(12,22-n.path("attrs").path("level").asInt(1)*2));}
                }
            }
        }
        void docInline(XWPFParagraph p,JsonNode n) throws Exception {
            if(type(n).equals("hardBreak")){p.createRun().addBreak();return;}
            if(type(n).equals("image")) {
                String data=imageData(n);if(data!=null){byte[] bytes=Base64.getDecoder().decode(data.substring(data.indexOf(',')+1));var image=ImageIO.read(new ByteArrayInputStream(bytes));if(image!=null){double scale=Math.min(1,Math.min(560.0/image.getWidth(),720.0/image.getHeight()));p.createRun().addPicture(new ByteArrayInputStream(bytes),data.startsWith("data:image/png")?Document.PICTURE_TYPE_PNG:Document.PICTURE_TYPE_JPEG,"image",Units.pixelToEMU((int)(image.getWidth()*scale)),Units.pixelToEMU((int)(image.getHeight()*scale)));return;}}
                p.createRun().setText(imageLabel(n));return;
            }
            if(!List.of("text","resourceLink").contains(type(n))) {warn("DOCX block "+type(n)+" rendered using its content.");for(var c:children(n))docInline(p,c);return;}
            String value=type(n).equals("resourceLink")?reference(n):n.path("text").asText();
            String href="";for(var mark:n.path("marks"))if(type(mark).equals("link")){String raw=mark.path("attrs").path("href").asText();href=safeLink(raw);if(href.isEmpty()){value+=" ("+raw+")";warn("Unsupported link target preserved as text.");}}
            XWPFRun r=href.isEmpty()?p.createRun():p.createHyperlinkRun(href);r.setText(value);r.setFontFamily("Noto Sans");r.setFontSize(11);
            for(var mark:n.path("marks"))switch(type(mark)) {case "bold"->r.setBold(true);case "italic"->r.setItalic(true);case "strike"->r.setStrikeThrough(true);case "underline"->r.setUnderline(UnderlinePatterns.SINGLE);case "code"->r.setFontFamily("Consolas");case "highlight"->r.setTextHighlightColor("yellow");case "link"->{}default->warn("Unsupported mark "+type(mark)+" omitted; text retained.");}
        }
        void docRecords(IBody body,Grid grid) throws Exception {for(int row=0;row<grid.height;row++){paragraph(body).createRun().setText("Row "+(row+1));for(var cell:grid.cells)if(cell.row==row){paragraph(body).createRun().setText("Column "+(cell.col+1));for(var child:children(cell.node))docBlocks(body,child,0,"");}}}
        void docTable(XWPFDocument doc,JsonNode n) throws Exception {
            var grid=new Grid(n);if(grid.width>8){warn("Tables wider than eight columns are rendered as row records for legibility in PDF/DOCX.");docRecords(doc,grid);return;}
            var table=doc.createTable(grid.height,grid.width);table.setWidth("100%");
            var layout=table.getCTTbl().getTblPr().addNewTblLayout();layout.setType(STTblLayoutType.FIXED);
            for(int row=0;row<grid.height;row++) {
                var tr=table.getRow(row);boolean header=true;
                for(int col=grid.width-1;col>=0;col--){var source=grid.at[row][col];var cell=tr.getCell(col);if(source!=null && col!=source.col){tr.removeCell(col);continue;}
                    var pr=cell.getCTTc().addNewTcPr();pr.addNewTcW().setW(BigInteger.valueOf(9906L*(source==null?1:source.cols)/grid.width));pr.getTcW().setType(STTblWidth.DXA);
                    if(source==null){header=false;continue;}if(source.cols>1)pr.addNewGridSpan().setVal(BigInteger.valueOf(source.cols));if(source.rows>1)pr.addNewVMerge().setVal(row==source.row?STMerge.RESTART:STMerge.CONTINUE);
                    header&=type(source.node).equals("tableHeader") && source.rows==1;
                    if(row==source.row){for(var child:children(source.node))docBlocks(cell,child,0,"");if(cell.getParagraphs().size()>1)cell.removeParagraph(0);}
                    if(type(source.node).equals("tableHeader")){cell.setColor("EDF1F6");for(var p:cell.getParagraphs())for(var r:p.getRuns())r.setBold(true);}
                }
                if(header)tr.setRepeatHeader(true);
            }
            doc.createParagraph();
        }
    }
    private record Cell(JsonNode node,int row,int col,int rows,int cols) {}
    private static class Grid {
        final int height,width;final Cell[][] at;final List<Cell> cells=new ArrayList<>();
        Grid(JsonNode table) {
            var rows=children(table);height=rows.size();if(height<1||height>10000)throw new IllegalArgumentException("Invalid table height");
            var occupied=new HashMap<Integer,Cell>();int max=0;
            for(int row=0;row<height;row++){int col=0;for(var node:children(rows.get(row))){while(occupied.containsKey(row*500+col))col++;int rs=span(node,"rowspan"),cs=span(node,"colspan");if(col+cs>500||row+rs>height)throw new IllegalArgumentException("Table spans exceed its bounds");var cell=new Cell(node,row,col,rs,cs);cells.add(cell);for(int r=row;r<row+rs;r++)for(int c=col;c<col+cs;c++)if(occupied.put(r*500+c,cell)!=null)throw new IllegalArgumentException("Overlapping table cells");col+=cs;max=Math.max(max,col);}}
            width=max;if(width<1 || (long)width*height>50000)throw new IllegalArgumentException("Table export exceeds 50,000 cells");at=new Cell[height][width];for(var entry:occupied.entrySet())at[entry.getKey()/500][entry.getKey()%500]=entry.getValue();
        }
    }
}
