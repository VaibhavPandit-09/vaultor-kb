package vaultor.linked;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Private evidence review has no source-root capability and cannot restore or
 * publish content. One-use tickets bind the exact files reviewed for removal. */
final class PrivateEvidence {
    record Ticket(String operation,String fingerprint,long expires){}
    record Review(String ticket,List<String> artifacts){}
    private final Path root;
    private final Map<String,Ticket> tickets=new HashMap<>();
    PrivateEvidence(Path root){this.root=root;}
    private Path operation(String id)throws IOException{try{if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}return root.resolve(id);}
    private List<Path> files(Path operation)throws IOException{
        try(var entries=Files.list(operation)){var files=entries.sorted().limit(13).toList();if(files.size()>12)throw new IOException("RECOVERY_ENTRY_LIMIT");for(Path file:files)if(!file.getFileName().toString().matches("(?:[0-9]{2}\\.rec|stage\\.md|captured\\.md|external\\.md|view\\.ref)"))throw new IOException("RECOVERY_ENTRY_TYPE");return files;}
    }
    private String fingerprint(Path operation)throws IOException{
        try(var parent=WindowsFiles.pinPublication(root);var pins=WindowsFiles.pinPublication(operation)){
            StringBuilder text=new StringBuilder(pins.last().identity());
            for(Path path:files(operation))try(var file=WindowsFiles.leaseRelative(pins.handle(),path.getFileName().toString(),false)){
                var info=WindowsFiles.info(file);text.append('\n').append(path.getFileName()).append(':').append(info.identity()).append(':').append(LinkedStore.hash(WindowsFiles.read(file,LinkedStore.JOURNAL_LIMIT)));
            }
            pins.verify();parent.verify();return LinkedStore.hash(LinkedStore.utf8(text.toString()));
        }
    }
    Review review(String operation)throws IOException{
        tickets.entrySet().removeIf(entry->entry.getValue().expires()<System.currentTimeMillis());if(tickets.size()>=16)throw new IOException("RECOVERY_REVIEW_LIMIT");
        Path op=operation(operation);String fingerprint=fingerprint(op),ticket=UUID.randomUUID().toString();var artifacts=new ArrayList<String>();
        try(var parent=WindowsFiles.pinPublication(root);var pins=WindowsFiles.pinPublication(op)){
            for(Path path:files(op)){String name=path.getFileName().toString();if(Set.of("captured.md","stage.md","external.md").contains(name))artifacts.add(name.substring(0,name.length()-3));}
        }
        tickets.put(ticket,new Ticket(operation,fingerprint,System.currentTimeMillis()+60000));return new Review(ticket,List.copyOf(artifacts));
    }
    String consume(String ticket)throws IOException{
        var review=tickets.remove(ticket);if(review==null||review.expires()<System.currentTimeMillis())throw new IOException("RECOVERY_REVIEW_EXPIRED");
        if(!fingerprint(operation(review.operation())).equals(review.fingerprint()))throw new IOException("RECOVERY_EVIDENCE_CHANGED");return review.operation();
    }
}
