package com.vaultor.vaultor.service;

import java.io.*;
import java.nio.file.*;
import java.nio.charset.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.text.PDFTextStripper;

/** Narrow subprocess entry point. No Spring, network, scripts, attachments or rendering. */
public final class FileTextProcess {
    public static final int MAX_CHARS=500_000, MAX_PAGES=100;
    public static final long PDF_BYTES=20L*1024*1024, TEXT_BYTES=4L*1024*1024;
    public record Result(String state,String text,String detail) {}
    private static final class Limit extends IOException {}
    static Result extract(Path path,String kind) {
        try {
            if(Files.size(path)>(kind.equals("pdf")?PDF_BYTES:TEXT_BYTES))return new Result("limit-exceeded","","File byte limit exceeded");
            if(kind.equals("text")) {
                String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(Files.readAllBytes(path))).toString();
                if(text.indexOf('\0')>=0)return new Result("invalid","","Binary or unsupported text encoding");
                if(text.length()>MAX_CHARS)return new Result("limit-exceeded","","Text output limit exceeded");
                return new Result("indexed",text,"UTF-8 text");
            }
            try(var doc=Loader.loadPDF(path.toFile(),IOUtils.createMemoryOnlyStreamCache())) {
                if(doc.isEncrypted()||!doc.getCurrentAccessPermission().canExtractContent())return new Result("encrypted","","Encrypted or restricted PDF");
                if(doc.getNumberOfPages()>MAX_PAGES)return new Result("limit-exceeded","","PDF page limit exceeded");
                var text=new StringBuilder();
                Writer bounded=new Writer(){public void write(char[] c,int off,int len)throws IOException{if(text.length()+len>MAX_CHARS)throw new Limit();text.append(c,off,len);}public void flush(){}public void close(){}};
                new PDFTextStripper().writeText(doc,bounded);
                return new Result(text.toString().isBlank()?"no-text":"indexed",text.toString(),text.toString().isBlank()?"No extractable text; OCR is not enabled":"PDF saved text");
            }
        }catch(org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException e){return new Result("encrypted","","Encrypted PDF");}
        catch(Limit e){return new Result("limit-exceeded","","Text output limit exceeded");}
        catch(Exception e){return new Result("invalid","","Invalid file or unsupported text encoding");}
    }
    public static void main(String[] args)throws Exception {
        var result=extract(Path.of(args[0]),args[1]);
        try(var out=new DataOutputStream(System.out)){out.writeUTF(result.state());out.writeUTF(result.detail());byte[] bytes=result.text().getBytes(StandardCharsets.UTF_8);out.writeInt(bytes.length);out.write(bytes);}
    }
}
