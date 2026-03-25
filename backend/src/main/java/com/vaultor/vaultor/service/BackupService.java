package com.vaultor.vaultor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.zip.*;

@Service
public class BackupService {
    @Value("${app.storage.path}")
    private String storagePath;
    
    @Value("${DB_PATH:./data/app.db}")
    private String dbPath;

    private static final int GCM_TAG_LENGTH = 128; 
    private static final int IV_LENGTH = 12; 
    private static final int SALT_LENGTH = 16;
    private static final int ITERATIONS = 65536;
    private static final byte VERSION = 0x01;

    public void exportData(OutputStream os, String password) throws Exception {
        SecureRandom random = new SecureRandom();
        byte[] salt = new byte[SALT_LENGTH];
        random.nextBytes(salt);
        byte[] iv = new byte[IV_LENGTH];
        random.nextBytes(iv);

        SecretKey key = deriveKey(password, salt);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

        os.write(VERSION);
        os.write(salt);
        os.write(iv);

        Path tempZip = Files.createTempFile("export", ".zip");
        try {
            try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(tempZip))) {
                Path db = Paths.get(dbPath);
                if (Files.exists(db)) {
                    zos.putNextEntry(new ZipEntry("app.db"));
                    Files.copy(db, zos);
                    zos.closeEntry();
                }
                Path files = Paths.get(storagePath);
                if (Files.exists(files)) {
                    Files.walk(files).filter(path -> !Files.isDirectory(path)).forEach(path -> {
                        try {
                            String zipName = "files/" + files.relativize(path).toString();
                            zos.putNextEntry(new ZipEntry(zipName));
                            Files.copy(path, zos);
                            zos.closeEntry();
                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                    });
                }
            }

            try (InputStream is = Files.newInputStream(tempZip)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    byte[] output = cipher.update(buffer, 0, read);
                    if (output != null) {
                        os.write(output);
                    }
                }
                byte[] outputBytes = cipher.doFinal();
                if (outputBytes != null) os.write(outputBytes);
            }
        } finally {
            Files.deleteIfExists(tempZip);
        }
    }

    public void importData(MultipartFile encryptedFile, String password) throws Exception {
        Path tempZip = Files.createTempFile("import", ".zip");
        try {
            try (InputStream is = encryptedFile.getInputStream()) {
                int version = is.read();
                if (version != VERSION) throw new IllegalArgumentException("Unsupported file version");

                byte[] salt = new byte[SALT_LENGTH];
                if (is.read(salt) != SALT_LENGTH) throw new IllegalArgumentException("Corrupted file");

                byte[] iv = new byte[IV_LENGTH];
                if (is.read(iv) != IV_LENGTH) throw new IllegalArgumentException("Corrupted file");

                SecretKey key = deriveKey(password, salt);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

                try (OutputStream os = Files.newOutputStream(tempZip)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        byte[] output = cipher.update(buffer, 0, read);
                        if (output != null) os.write(output);
                    }
                    byte[] outputBytes = cipher.doFinal(); // Vefifies GCM MAC
                    if (outputBytes != null) os.write(outputBytes);
                }
            }

            try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(tempZip))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    if (entry.getName().equals("app.db")) {
                        Path db = Paths.get(dbPath);
                        Files.createDirectories(db.getParent());
                        Files.copy(zis, db, StandardCopyOption.REPLACE_EXISTING);
                    } else if (entry.getName().startsWith("files/")) {
                        Path target = Paths.get(storagePath).resolve(entry.getName().substring(6));
                        Files.createDirectories(target.getParent());
                        Files.copy(zis, target, StandardCopyOption.REPLACE_EXISTING);
                    }
                    zis.closeEntry();
                }
            }
        } finally {
            Files.deleteIfExists(tempZip);
        }
    }

    private SecretKey deriveKey(String password, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256);
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        byte[] keyBytes = factory.generateSecret(spec).getEncoded();
        return new SecretKeySpec(keyBytes, "AES");
    }
}
