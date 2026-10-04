package com.vaultor.vaultor.host;

import java.nio.file.*;
import java.nio.file.attribute.*;
import java.io.IOException;
import java.util.*;

/** Host secrets never belong in the database, workspace archive, or installation. */
final class HostFiles {
    static void privatePath(Path path, boolean directory) throws IOException {
        var posix=Files.getFileAttributeView(path, PosixFileAttributeView.class);
        if(posix!=null) posix.setPermissions(PosixFilePermissions.fromString(directory?"rwx------":"rw-------"));
        var acl=Files.getFileAttributeView(path,AclFileAttributeView.class);
        if(acl!=null) {
            var permissions=EnumSet.allOf(AclEntryPermission.class);
            acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(Files.getOwner(path)).setPermissions(permissions).build()));
        }
    }
    static void write(Path path, byte[] data) throws IOException {
        Path temp=path.resolveSibling(path.getFileName()+"."+UUID.randomUUID()+".tmp");
        try {
            Files.createFile(temp); privatePath(temp,false);
            try(var channel=java.nio.channels.FileChannel.open(temp,StandardOpenOption.WRITE)) {
                var buffer=java.nio.ByteBuffer.wrap(data); while(buffer.hasRemaining()) channel.write(buffer); channel.force(true);
            }
            Files.move(temp,path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temp); }
    }
}
