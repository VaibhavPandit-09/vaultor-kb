package vaultor.linked;
import java.nio.file.*;import java.nio.channels.*;import java.util.*;
public final class MappedWriter {
    public static void main(String[] args)throws Exception{
        Path file=Path.of(new String(Base64.getDecoder().decode(args[0]),java.nio.charset.StandardCharsets.UTF_8));
        java.nio.MappedByteBuffer mapping;try(var channel=FileChannel.open(file,StandardOpenOption.READ,StandardOpenOption.WRITE)){mapping=channel.map(FileChannel.MapMode.READ_WRITE,0,channel.size());}
        System.out.println("MAPPED");System.out.flush();System.in.read();mapping.put(0,(byte)'E');mapping.force();
    }
}
