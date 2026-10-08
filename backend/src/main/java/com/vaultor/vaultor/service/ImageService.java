package com.vaultor.vaultor.service;

import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;
import java.nio.file.*;
import java.io.*;
import javax.imageio.*;
import javax.imageio.stream.*;
import java.util.*;

/** Inspect headers before decoding. Original bytes are never rewritten. */
@Service @RequiredArgsConstructor
public class ImageService {
    public static final long MAX_BYTES=20L*1024*1024, MAX_PIXELS=40_000_000;
    private final ResourceService resources;
    private final FileStorageService files;
    public record Info(String format,int width,int height,long bytes,boolean animated) {}
    public Info info(String id) throws IOException {
        var resource=resources.getResourceOrThrow(id);
        if(!"file".equals(resource.getType()))throw new IllegalArgumentException("Choose an image file resource");
        return inspect(files.getFile(resource.getFilePath()));
    }
    public byte[] clipboardPng(String id) throws IOException {
        var resource=resources.getResourceOrThrow(id);
        if(!"file".equals(resource.getType()))throw new IllegalArgumentException("Choose an image file resource");
        return png(files.getFile(resource.getFilePath()));
    }
    public static Info inspect(Path path) throws IOException {
        long size=Files.size(path);
        if(size==0 || size>MAX_BYTES)throw new IllegalArgumentException("Inline images must be nonempty and at most 20 MiB. Import larger files as ordinary resources.");
        try(ImageInputStream input=ImageIO.createImageInputStream(path.toFile())) {
            var readers=ImageIO.getImageReaders(input);
            if(!readers.hasNext())throw new IllegalArgumentException("Use PNG, JPEG, WebP or GIF for inline images. Other formats can be imported as files.");
            var reader=readers.next();
            try {
                String format=reader.getFormatName().toLowerCase(Locale.ROOT);if(format.equals("jpg"))format="jpeg";
                if(!Set.of("png","jpeg","webp","gif").contains(format))throw new IllegalArgumentException("Use PNG, JPEG, WebP or GIF for inline images.");
                reader.setInput(input,false,false);int width=reader.getWidth(0),height=reader.getHeight(0);
                if(width<1 || height<1 || (long)width*height>MAX_PIXELS)throw new IllegalArgumentException("Inline images are limited to 40 megapixels.");
                boolean animated=false;
                if(format.equals("gif"))animated=reader.getNumImages(true)>1;
                if(format.equals("webp")) {byte[] header=new byte[32];try(var in=Files.newInputStream(path)){int read=in.read(header);animated=read>=21 && new String(header,12,4,java.nio.charset.StandardCharsets.US_ASCII).equals("VP8X") && (header[20]&2)!=0;}}
                return new Info(format,width,height,size,animated);
            } finally {reader.dispose();}
        }
    }
    /** Bounded first frame for portable renderers/native clipboard; originals remain untouched. */
    public static byte[] png(Path path) throws IOException {
        inspect(path);
        try(ImageInputStream input=ImageIO.createImageInputStream(path.toFile())) {
            var reader=ImageIO.getImageReaders(input).next();
            try {reader.setInput(input);var frame=reader.read(0);var output=new ByteArrayOutputStream();ImageIO.write(frame,"png",output);return output.toByteArray();}
            finally {reader.dispose();}
        }
    }
}
