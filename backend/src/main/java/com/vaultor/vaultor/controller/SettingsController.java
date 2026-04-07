package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.SettingsService;
import com.vaultor.vaultor.service.SettingsService.SettingsDocument;
import com.vaultor.vaultor.service.SettingsService.WorkspaceSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {
    private final SettingsService settingsService;

    @GetMapping
    public SettingsDocument getSettings() {
        return settingsService.getSettings();
    }

    @PutMapping
    public SettingsDocument updateSettings(@RequestBody SettingsDocument settingsDocument) {
        return settingsService.updateSettings(settingsDocument);
    }

    @GetMapping("/workspace")
    public WorkspaceSettings getWorkspaceSettings() {
        return settingsService.getSettings().workspace();
    }

    @PutMapping("/workspace")
    public WorkspaceSettings updateWorkspaceSettings(@RequestBody WorkspaceSettings workspaceSettings) {
        SettingsDocument current = settingsService.getSettings();
        SettingsDocument updated = new SettingsDocument(workspaceSettings, current.local(), current.keybindings());
        return settingsService.updateSettings(updated).workspace();
    }

    @DeleteMapping("/workspace")
    public WorkspaceSettings resetWorkspaceSettings() {
        return settingsService.resetWorkspaceSettings();
    }
}
