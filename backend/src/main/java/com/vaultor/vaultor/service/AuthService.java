package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Setting;
import com.vaultor.vaultor.repository.SettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final SettingRepository settingRepository;
    private final Map<String, LocalDateTime> activeTokens = new ConcurrentHashMap<>();

    public boolean isSetup() {
        return settingRepository.findById("master_password").isPresent();
    }

    public void setup(String password) {
        if (isSetup()) throw new IllegalStateException("Already setup");
        String hash = hashPassword(password);
        settingRepository.save(new Setting("master_password", hash));
    }

    public boolean verifyPasswordLiteral(String password) {
        Setting pwdSetting = settingRepository.findById("master_password").orElse(null);
        if (pwdSetting == null) return false;
        return checkPassword(password, pwdSetting.getValue());
    }

    public String login(String password) {
        Setting pwdSetting = settingRepository.findById("master_password")
                .orElseThrow(() -> new IllegalStateException("Not setup"));
        if (checkPassword(password, pwdSetting.getValue())) {
            String token = UUID.randomUUID().toString();
            activeTokens.put(token, LocalDateTime.now().plusHours(24));
            return token;
        }
        throw new IllegalArgumentException("Invalid password");
    }

    public boolean validateToken(String token) {
        if (token == null || !activeTokens.containsKey(token)) return false;
        if (activeTokens.get(token).isBefore(LocalDateTime.now())) {
            activeTokens.remove(token);
            return false;
        }
        return true;
    }

    private String hashPassword(String password) {
        try {
            java.security.SecureRandom random = new java.security.SecureRandom();
            byte[] salt = new byte[16];
            random.nextBytes(salt);
            javax.crypto.spec.PBEKeySpec spec = new javax.crypto.spec.PBEKeySpec(password.toCharArray(), salt, 65536, 256);
            javax.crypto.SecretKeyFactory factory = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] hash = factory.generateSecret(spec).getEncoded();
            return java.util.Base64.getEncoder().encodeToString(salt) + ":" + java.util.Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Error hashing", e);
        }
    }

    private boolean checkPassword(String password, String stored) {
        try {
            String[] parts = stored.split(":");
            byte[] salt = java.util.Base64.getDecoder().decode(parts[0]);
            byte[] hash = java.util.Base64.getDecoder().decode(parts[1]);
            
            javax.crypto.spec.PBEKeySpec spec = new javax.crypto.spec.PBEKeySpec(password.toCharArray(), salt, 65536, 256);
            javax.crypto.SecretKeyFactory factory = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] testHash = factory.generateSecret(spec).getEncoded();
            
            return java.util.Arrays.equals(hash, testHash);
        } catch (Exception e) {
            return false;
        }
    }
}
