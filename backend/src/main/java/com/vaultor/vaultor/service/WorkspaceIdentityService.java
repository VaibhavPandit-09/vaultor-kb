package com.vaultor.vaultor.service;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.UUID;
@Service @RequiredArgsConstructor
public class WorkspaceIdentityService {
    private final JdbcTemplate jdbc;
    @org.springframework.beans.factory.annotation.Value("${app.workspace.id:}") private String configuredId;
    public record Identity(String id, String generation) {}
    @Transactional public Identity current() {
        if(jdbc.queryForObject("SELECT COUNT(*) FROM settings WHERE key_name IN ('workspace_identity','workspace_generation')",Integer.class)<2) {
        jdbc.update("INSERT OR IGNORE INTO settings(key_name,value) VALUES ('workspace_identity',?)", (configuredId==null || configuredId.isBlank()?UUID.randomUUID().toString():configuredId));
        jdbc.update("INSERT OR IGNORE INTO settings(key_name,value) VALUES ('workspace_generation',?)", UUID.randomUUID().toString());
        }
        String actual=jdbc.queryForObject("SELECT value FROM settings WHERE key_name='workspace_identity'",String.class);
        if(configuredId!=null && !configuredId.isBlank() && !configuredId.equals(actual))throw new IllegalStateException("Workspace storage identity mismatch; nothing was reset");
        return new Identity(actual,jdbc.queryForObject("SELECT value FROM settings WHERE key_name='workspace_generation'",String.class));
    }
    @Transactional public void replaced() { current(); jdbc.update("UPDATE settings SET value=? WHERE key_name='workspace_generation'",UUID.randomUUID().toString()); }
}
