package com.vaultor.vaultor;

import com.vaultor.vaultor.model.Setting;
import com.vaultor.vaultor.repository.SettingRepository;
import com.vaultor.vaultor.service.SettingsService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SidebarSettingsTest {
    @Test void preferencesSurviveScopedPatchesAndLegacyDefaults() {
        var repository = mock(SettingRepository.class);
        var stored = new AtomicReference<Setting>();
        when(repository.findById(anyString())).thenAnswer(call -> Optional.ofNullable(stored.get()));
        when(repository.save(any(Setting.class))).thenAnswer(call -> { stored.set(call.getArgument(0)); return stored.get(); });
        var mapper = new ObjectMapper();
        var service = new SettingsService(repository, mapper);
        service.patch(mapper.readTree("{\"local\":{\"device\":{\"theme\":\"light\"}}}"));
        assertTrue(service.getSettings().local().get("device").sidebarSections().get("pinned").visible());
        service.patch(mapper.readTree("{\"local\":{\"device\":{\"sidebarSections\":{\"pinned\":{\"visible\":false},\"recent\":{\"collapsed\":true}}}}}"));
        var local = service.getSettings().local().get("device");
        assertEquals("light", local.theme());
        assertFalse(local.sidebarSections().get("pinned").visible());
        assertTrue(local.sidebarSections().get("recent").collapsed());
        assertTrue(local.sidebarSections().get("tags").visible());
        service.patch(mapper.readTree("{\"local\":{\"device\":{\"sidebarSections\":{\"pinned\":{\"collapsed\":true}}}}}"));
        assertFalse(service.getSettings().local().get("device").sidebarSections().get("pinned").visible());
        assertEquals(3,service.getSettings().local().get("device").sidebarSections().size());
    }
}
