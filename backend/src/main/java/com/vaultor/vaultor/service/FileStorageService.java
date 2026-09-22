package com.vaultor.vaultor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

@Service
public class FileStorageService {
    @Value("${app.storage.path}")
    private String storagePath;

    public void init() throws IOException {
        Files.createDirectories(Paths.get(storagePath));
    }

    public String storeFile(MultipartFile file) throws IOException {
        init();
        String storedName = UUID.randomUUID().toString() + "_" + file.getOriginalFilename();
        Path targetPath = Paths.get(storagePath).resolve(storedName).normalize().toAbsolutePath();
        if (!targetPath.getParent().equals(Paths.get(storagePath).normalize().toAbsolutePath())) {
            throw new SecurityException("Cannot store file outside current directory.");
        }
        try (var input = file.getInputStream()) { Files.copy(input, targetPath, StandardCopyOption.REPLACE_EXISTING); }
        return storedName;
    }

    public Path getFile(String storedName) {
        if (storedName == null) throw new IllegalArgumentException("Missing stored filename");
        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        Path target = root.resolve(storedName).normalize();
        if (!target.getParent().equals(root)) throw new IllegalArgumentException("Invalid stored filename");
        return target;
    }

    public void deleteFile(String storedName) throws IOException {
        Files.deleteIfExists(getFile(storedName));
    }
}
