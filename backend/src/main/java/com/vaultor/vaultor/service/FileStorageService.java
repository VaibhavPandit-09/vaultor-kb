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
        Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
        return storedName;
    }

    public Path getFile(String storedName) {
        return Paths.get(storagePath).resolve(storedName).normalize().toAbsolutePath();
    }

    public void deleteFile(String storedName) throws IOException {
        Files.deleteIfExists(getFile(storedName));
    }
}
