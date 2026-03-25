package com.vaultor.vaultor.controller;

import com.vaultor.vaultor.service.WorkspaceSettingsService;
import com.vaultor.vaultor.service.WorkspaceSettingsService.WorkspaceSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {
    private final WorkspaceSettingsService workspaceSettingsService;

    @GetMapping("/workspace")
    public WorkspaceSettings getWorkspaceSettings() {
        return workspaceSettingsService.getWorkspaceSettings();
    }

    @PutMapping("/workspace")
    public WorkspaceSettings updateWorkspaceSettings(@RequestBody WorkspaceSettings workspaceSettings) {
        return workspaceSettingsService.updateWorkspaceSettings(workspaceSettings);
    }

    @DeleteMapping("/workspace")
    public WorkspaceSettings resetWorkspaceSettings() {
        return workspaceSettingsService.resetWorkspaceSettings();
    }
}
