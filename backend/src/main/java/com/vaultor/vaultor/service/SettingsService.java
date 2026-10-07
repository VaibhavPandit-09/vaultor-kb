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
    /** Merge only supplied leaf fields inside one database transaction, preserving other clients. */
    @org.springframework.transaction.annotation.Transactional
    public SettingsDocument patch(tools.jackson.databind.JsonNode incoming) {
        if(incoming==null || !incoming.isObject() || incoming.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>65536)throw new IllegalArgumentException("Settings patch must be an object up to 64 KiB");
        var current=(tools.jackson.databind.node.ObjectNode)objectMapper.valueToTree(getSettings());
        merge(current,incoming,0);
        return updateSettings(objectMapper.treeToValue(current,SettingsDocument.class));
    }
    private void merge(tools.jackson.databind.node.ObjectNode target,tools.jackson.databind.JsonNode patch,int depth) {
        if(depth>4)throw new IllegalArgumentException("Invalid settings patch depth");
        for(var entry:patch.properties()) {
            String key=entry.getKey();var value=entry.getValue();
            if(key.length()>100 || depth==0 && !java.util.Set.of("workspace","local","keybindings").contains(key))throw new IllegalArgumentException("Invalid settings patch field");
            if(value.isObject()) {var child=target.get(key);if(child==null || !child.isObject())child=target.putObject(key);merge((tools.jackson.databind.node.ObjectNode)child,value,depth+1);}
            else if(value.isNull())target.remove(key);
            else if(value.isValueNode())target.set(key,value);
            else throw new IllegalArgumentException("Settings patch fields must be scalar values");
        }
    }

    @org.springframework.transaction.annotation.Transactional public WorkspaceSettings resetWorkspaceSettings() {
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
                    normalizedKeybindings.put(action, normalizeKeybinding(action, keybinding));
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

        String theme = "light".equalsIgnoreCase(incoming.theme()) ? "light" : "dark".equalsIgnoreCase(incoming.theme()) ? "dark" : "oled".equalsIgnoreCase(incoming.theme()) ? "oled" : "os";
        String accentColor = isAccentColor(incoming.accentColor()) ? incoming.accentColor() : defaultLocalSettings().accentColor();
        String density = "compact".equalsIgnoreCase(incoming.density()) ? "compact" : "comfortable";
        String animationMode = "smooth".equalsIgnoreCase(incoming.animationMode()) ? "smooth" : "snappy";
        String previewMode = "modal".equalsIgnoreCase(incoming.previewMode()) ? "modal" : "side";
        String sidebarMode = "floating".equalsIgnoreCase(incoming.sidebarMode()) ? "floating" : "fixed";
        double uiTransparency = incoming.uiTransparency() == null ? defaultLocalSettings().uiTransparency() : Math.max(0.6d, Math.min(1d, incoming.uiTransparency()));
        boolean sidebarCollapsed = incoming.sidebarCollapsed() != null && incoming.sidebarCollapsed();

        return new LocalSettings(theme, accentColor, density, animationMode, previewMode, sidebarMode, uiTransparency, sidebarCollapsed, normalizeSidebarSections(incoming.sidebarSections()));
    }

    private static Map<String, SidebarSection> normalizeSidebarSections(Map<String, SidebarSection> incoming) {
        Map<String, SidebarSection> result = new LinkedHashMap<>();
        for (String name : java.util.List.of("pinned", "recent", "tags")) {
            SidebarSection value = incoming == null ? null : incoming.get(name);
            result.put(name, new SidebarSection(value == null || !Boolean.FALSE.equals(value.visible()),
                    value != null && Boolean.TRUE.equals(value.collapsed()),
                    !name.equals("tags") && value != null && value.type()!=null && value.type().matches("[a-zA-Z0-9_-]{1,80}") ? value.type() : "all"));
        }
        return result;
    }

    public record SidebarSection(Boolean visible, Boolean collapsed, String type) {}

    private Keybinding normalizeKeybinding(String action, Keybinding incoming) {
        String mac = normalizeShortcutString(incoming == null ? null : incoming.mac());
        String windows = normalizeShortcutString(incoming == null ? null : incoming.windows());
        if ("toggleSidebar".equals(action)) {
            if ("Mod+B".equals(mac)) mac = "Mod+Alt+B";
            if ("Mod+B".equals(windows)) windows = "Mod+Alt+B";
        }
        String oldDefault = "switchNoteNext".equals(action) ? "Mod+ArrowRight" : "switchNotePrevious".equals(action) ? "Mod+ArrowLeft" : null;
        if (oldDefault != null) {
            if (oldDefault.equals(mac) || oldDefault.replace("Mod+", "Mod+Alt+").equals(mac) || ("switchNoteNext".equals(action) ? "Mod+Alt+PageDown" : "Mod+Alt+PageUp").equals(mac)) mac = DEFAULT_KEYBINDINGS.get(action).mac();
            if (oldDefault.equals(windows) || oldDefault.replace("Mod+", "Mod+Alt+").equals(windows) || ("switchNoteNext".equals(action) ? "Mod+Alt+PageDown" : "Mod+Alt+PageUp").equals(windows)) windows = DEFAULT_KEYBINDINGS.get(action).windows();
        }
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
        return new LocalSettings("os", "blue", "comfortable", "snappy", "side", "fixed", 0.85d, false, normalizeSidebarSections(null));
    }

    public static final Map<String, Keybinding> DEFAULT_KEYBINDINGS = Map.of(
            "commandPalette", new Keybinding("Mod+K", "Mod+K"),
            "switchNoteNext", new Keybinding("Alt+ArrowRight", "Alt+ArrowRight"),
            "switchNotePrevious", new Keybinding("Alt+ArrowLeft", "Alt+ArrowLeft"),
            "closeActiveNote", new Keybinding("Mod+Shift+Backspace", "Mod+Shift+Backspace"),
            "toggleSidebar", new Keybinding("Mod+Alt+B", "Mod+Alt+B"),
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
            Boolean sidebarCollapsed,
            Map<String, SidebarSection> sidebarSections
    ) {}

    public record Keybinding(
            String mac,
            String windows
    ) {}
}
