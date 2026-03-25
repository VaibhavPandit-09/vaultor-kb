package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Setting;
import com.vaultor.vaultor.repository.SettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class WorkspaceSettingsService {
    private static final String WORKSPACE_SETTINGS_KEY = "workspace_settings";

    private final SettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    public WorkspaceSettings getWorkspaceSettings() {
        return settingRepository.findById(WORKSPACE_SETTINGS_KEY)
                .map(Setting::getValue)
                .map(this::deserializeSettings)
                .map(this::normalize)
                .orElseGet(WorkspaceSettingsService::defaultSettings);
    }

    public WorkspaceSettings updateWorkspaceSettings(WorkspaceSettings workspaceSettings) {
        WorkspaceSettings normalized = normalize(workspaceSettings);
        try {
            String serialized = objectMapper.writeValueAsString(normalized);
            settingRepository.save(new Setting(WORKSPACE_SETTINGS_KEY, serialized));
            return normalized;
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to persist workspace settings", exception);
        }
    }

    public WorkspaceSettings resetWorkspaceSettings() {
        settingRepository.deleteById(WORKSPACE_SETTINGS_KEY);
        return defaultSettings();
    }

    public static WorkspaceSettings defaultSettings() {
        return new WorkspaceSettings(2, "split", 0, false);
    }

    private WorkspaceSettings deserializeSettings(String rawValue) {
        try {
            return objectMapper.readValue(rawValue, WorkspaceSettings.class);
        } catch (Exception exception) {
            return defaultSettings();
        }
    }

    private WorkspaceSettings normalize(WorkspaceSettings incoming) {
        if (incoming == null) {
            return defaultSettings();
        }

        int maxOpenNotes = incoming.maxOpenNotes() == null ? 2 : Math.max(1, Math.min(3, incoming.maxOpenNotes()));
        String openBehavior = "replace".equalsIgnoreCase(incoming.openBehavior()) ? "replace" : "split";
        int autosaveDelay = incoming.autosaveDelay() == null ? 0 : Math.max(0, incoming.autosaveDelay());
        boolean focusMode = incoming.focusMode() != null && incoming.focusMode();

        return new WorkspaceSettings(maxOpenNotes, openBehavior, autosaveDelay, focusMode);
    }

    public record WorkspaceSettings(
            Integer maxOpenNotes,
            String openBehavior,
            Integer autosaveDelay,
            Boolean focusMode
    ) {}
}
