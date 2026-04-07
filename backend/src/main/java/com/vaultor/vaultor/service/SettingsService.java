package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.Setting;
import com.vaultor.vaultor.repository.SettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SettingsService {
    private static final String SETTINGS_KEY = "app_settings_v2";
    private static final String LEGACY_WORKSPACE_SETTINGS_KEY = "workspace_settings";

    private final SettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    public SettingsDocument getSettings() {
        return settingRepository.findById(SETTINGS_KEY)
                .map(Setting::getValue)
                .map(this::deserializeSettings)
                .orElseGet(this::migrateLegacyWorkspaceSettings);
    }

    public SettingsDocument updateSettings(SettingsDocument incoming) {
        SettingsDocument normalized = normalizeDocument(incoming);
        persistSettings(normalized);
        return normalized;
    }

    public WorkspaceSettings resetWorkspaceSettings() {
        SettingsDocument current = getSettings();
        SettingsDocument updated = new SettingsDocument(defaultWorkspaceSettings(), current.local(), current.keybindings());
        persistSettings(updated);
        return updated.workspace();
    }

    private SettingsDocument migrateLegacyWorkspaceSettings() {
        WorkspaceSettings workspace = settingRepository.findById(LEGACY_WORKSPACE_SETTINGS_KEY)
                .map(Setting::getValue)
                .map(this::deserializeLegacyWorkspaceSettings)
                .orElseGet(SettingsService::defaultWorkspaceSettings);

        SettingsDocument migrated = new SettingsDocument(workspace, new LinkedHashMap<>(), new LinkedHashMap<>());
        persistSettings(migrated);
        settingRepository.deleteById(LEGACY_WORKSPACE_SETTINGS_KEY);
        return migrated;
    }

    private void persistSettings(SettingsDocument settingsDocument) {
        try {
            String serialized = objectMapper.writeValueAsString(normalizeDocument(settingsDocument));
            settingRepository.save(new Setting(SETTINGS_KEY, serialized));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to persist settings", exception);
        }
    }

    private SettingsDocument deserializeSettings(String rawValue) {
        try {
            return normalizeDocument(objectMapper.readValue(rawValue, SettingsDocument.class));
        } catch (Exception exception) {
            return new SettingsDocument(defaultWorkspaceSettings(), new LinkedHashMap<>(), new LinkedHashMap<>());
        }
    }

    private WorkspaceSettings deserializeLegacyWorkspaceSettings(String rawValue) {
        try {
            return normalizeWorkspaceSettings(objectMapper.readValue(rawValue, WorkspaceSettings.class));
        } catch (Exception exception) {
            return defaultWorkspaceSettings();
        }
    }

    private SettingsDocument normalizeDocument(SettingsDocument incoming) {
        Map<String, LocalSettings> normalizedLocal = new LinkedHashMap<>();
        if (incoming != null && incoming.local() != null) {
            incoming.local().forEach((deviceId, localSettings) -> {
                if (deviceId != null && !deviceId.isBlank()) {
                    normalizedLocal.put(deviceId, normalizeLocalSettings(localSettings));
                }
            });
        }

        Map<String, Keybinding> normalizedKeybindings = new LinkedHashMap<>();
        if (incoming != null && incoming.keybindings() != null) {
            incoming.keybindings().forEach((action, keybinding) -> {
                if (DEFAULT_KEYBINDINGS.containsKey(action)) {
                    normalizedKeybindings.put(action, normalizeKeybinding(keybinding));
                }
            });
        }

        return new SettingsDocument(
                normalizeWorkspaceSettings(incoming == null ? null : incoming.workspace()),
                normalizedLocal,
                normalizedKeybindings
        );
    }

    private WorkspaceSettings normalizeWorkspaceSettings(WorkspaceSettings incoming) {
        if (incoming == null) {
            return defaultWorkspaceSettings();
        }

        int maxOpenNotes = incoming.maxOpenNotes() == null ? 2 : Math.max(1, Math.min(3, incoming.maxOpenNotes()));
        String openBehavior = "replace".equalsIgnoreCase(incoming.openBehavior()) ? "replace" : "split";
        int autosaveDelay = incoming.autosaveDelay() == null ? 0 : Math.max(0, incoming.autosaveDelay());
        boolean focusMode = incoming.focusMode() != null && incoming.focusMode();

        return new WorkspaceSettings(maxOpenNotes, openBehavior, autosaveDelay, focusMode);
    }

    private LocalSettings normalizeLocalSettings(LocalSettings incoming) {
        if (incoming == null) {
            return defaultLocalSettings();
        }

        String theme = "light".equalsIgnoreCase(incoming.theme()) ? "light" : "dark";
        String accentColor = isAccentColor(incoming.accentColor()) ? incoming.accentColor() : defaultLocalSettings().accentColor();
        String density = "compact".equalsIgnoreCase(incoming.density()) ? "compact" : "comfortable";
        String animationMode = "smooth".equalsIgnoreCase(incoming.animationMode()) ? "smooth" : "snappy";
        String previewMode = "modal".equalsIgnoreCase(incoming.previewMode()) ? "modal" : "side";
        String sidebarMode = "floating".equalsIgnoreCase(incoming.sidebarMode()) ? "floating" : "fixed";
        double uiTransparency = incoming.uiTransparency() == null ? defaultLocalSettings().uiTransparency() : Math.max(0.6d, Math.min(1d, incoming.uiTransparency()));
        boolean sidebarCollapsed = incoming.sidebarCollapsed() != null && incoming.sidebarCollapsed();

        return new LocalSettings(theme, accentColor, density, animationMode, previewMode, sidebarMode, uiTransparency, sidebarCollapsed);
    }

    private Keybinding normalizeKeybinding(Keybinding incoming) {
        String mac = normalizeShortcutString(incoming == null ? null : incoming.mac());
        String windows = normalizeShortcutString(incoming == null ? null : incoming.windows());
        return new Keybinding(mac, windows);
    }

    private String normalizeShortcutString(String incoming) {
        if (incoming == null || incoming.isBlank()) {
            return null;
        }
        return incoming.trim();
    }

    private boolean isAccentColor(String accentColor) {
        if (accentColor == null) {
            return false;
        }

        return switch (accentColor.toLowerCase(Locale.ROOT)) {
            case "blue", "purple", "green", "orange", "red", "teal", "pink", "cyan" -> true;
            default -> false;
        };
    }

    public static WorkspaceSettings defaultWorkspaceSettings() {
        return new WorkspaceSettings(2, "split", 0, false);
    }

    public static LocalSettings defaultLocalSettings() {
        return new LocalSettings("dark", "blue", "comfortable", "snappy", "side", "fixed", 0.85d, false);
    }

    public static final Map<String, Keybinding> DEFAULT_KEYBINDINGS = Map.of(
            "commandPalette", new Keybinding("Mod+K", "Mod+K"),
            "switchNoteNext", new Keybinding("Mod+ArrowRight", "Mod+ArrowRight"),
            "switchNotePrevious", new Keybinding("Mod+ArrowLeft", "Mod+ArrowLeft"),
            "closeActiveNote", new Keybinding("Mod+Shift+Backspace", "Mod+Shift+Backspace"),
            "toggleSidebar", new Keybinding("Mod+B", "Mod+B"),
            "openShortcuts", new Keybinding("Mod+Slash", "Mod+Slash")
    );

    public record SettingsDocument(
            WorkspaceSettings workspace,
            Map<String, LocalSettings> local,
            Map<String, Keybinding> keybindings
    ) {}

    public record WorkspaceSettings(
            Integer maxOpenNotes,
            String openBehavior,
            Integer autosaveDelay,
            Boolean focusMode
    ) {}

    public record LocalSettings(
            String theme,
            String accentColor,
            String density,
            String animationMode,
            String previewMode,
            String sidebarMode,
            Double uiTransparency,
            Boolean sidebarCollapsed
    ) {}

    public record Keybinding(
            String mac,
            String windows
    ) {}
}
