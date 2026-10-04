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
    public SettingsDocument updateSettings(@RequestBody SettingsDocument settingsDocument,jakarta.servlet.http.HttpServletRequest request) {
        if(request.isSecure())throw new IllegalArgumentException("Use PATCH /api/settings for scoped network updates");
        return settingsService.updateSettings(settingsDocument);
    }
    @PatchMapping public SettingsDocument patch(@RequestBody tools.jackson.databind.JsonNode input){return settingsService.patch(input);}

    @GetMapping("/workspace")
    public WorkspaceSettings getWorkspaceSettings() {
        return settingsService.getSettings().workspace();
    }

    @PutMapping("/workspace")
    public WorkspaceSettings updateWorkspaceSettings(@RequestBody WorkspaceSettings workspaceSettings) {
        var json=new tools.jackson.databind.ObjectMapper();
        return settingsService.patch(json.valueToTree(java.util.Map.of("workspace",workspaceSettings))).workspace();
    }

    @DeleteMapping("/workspace")
    public WorkspaceSettings resetWorkspaceSettings() {
        return settingsService.resetWorkspaceSettings();
    }
}
