package com.vaultor.vaultor.service;

import java.nio.file.*;
import java.nio.*;
import java.nio.charset.*;
import java.io.*;
import java.util.*;

/** Bounded signature/text inspection. Client filenames and MIME claims cannot classify arbitrary bytes. */
public final class FileMime {
    private FileMime() {}
    public static String detect(Path file,String claimed) throws IOException {
        byte[] bytes;try(var input=Files.newInputStream(file)){bytes=input.readNBytes(8192);}
        String head=new String(bytes,StandardCharsets.ISO_8859_1);
        if(head.startsWith("\u0089PNG\r\n\u001a\n"))return "image/png";
        if(bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255)return "image/jpeg";
        if(head.startsWith("GIF87a")||head.startsWith("GIF89a"))return "image/gif";
        if(head.startsWith("RIFF")&&head.length()>=12&&head.substring(8,12).equals("WEBP"))return "image/webp";
        if(head.startsWith("%PDF-"))return "application/pdf";
        if(head.startsWith("RIFF")&&head.length()>=12&&head.substring(8,12).equals("WAVE"))return "audio/wav";
        if(head.startsWith("fLaC"))return "audio/flac";
        if(head.startsWith("ID3"))return "audio/mpeg";
        if(head.startsWith("OggS")&&(head.contains("OpusHead")||head.contains("vorbis")))return "audio/ogg";
        if(head.length()>=12&&head.substring(4,8).equals("ftyp"))return head.substring(8,12).equals("M4A ")?"audio/mp4":"video/mp4";
        if(bytes.length>=4&&(bytes[0]&255)==26&&(bytes[1]&255)==69&&(bytes[2]&255)==223&&(bytes[3]&255)==163)return "video/webm";
        if(bytes.length==0)return "application/octet-stream";
        for(byte b:bytes)if((b&255)<32&&b!='\n'&&b!='\r'&&b!='\t')return "application/octet-stream";
        var decoder=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT);
        var result=decoder.decode(ByteBuffer.wrap(bytes),CharBuffer.allocate(bytes.length),Files.size(file)<=bytes.length);
        if(result.isError())return "application/octet-stream";
        String mime=claimed==null?"":claimed.toLowerCase(Locale.ROOT).split(";",2)[0].trim();
        return mime.startsWith("text/")||Set.of("application/json","application/xml","application/javascript").contains(mime)?mime:"text/plain";
    }
}
