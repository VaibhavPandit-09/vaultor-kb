package com.vaultor.vaultor;

import com.vaultor.vaultor.controller.DiagnosticsController;
import com.vaultor.vaultor.config.RequestLoggingFilter;
import com.vaultor.vaultor.service.BuildInformation;
import com.vaultor.vaultor.service.WorkspaceGate;
import com.vaultor.vaultor.service.SettingsService;
import com.vaultor.vaultor.repository.SettingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.slf4j.MDC;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class DesktopContractTest {
    @Test void settingsMigrateOnlyTheFormerSidebarDefault() {
        var settings = new SettingsService(mock(SettingRepository.class), new tools.jackson.databind.ObjectMapper());
        var result = settings.updateSettings(new SettingsService.SettingsDocument(null,null,java.util.Map.of("toggleSidebar",new SettingsService.Keybinding("Mod+B","Mod+Alt+S"))));
        assertEquals("Mod+Alt+B",result.keybindings().get("toggleSidebar").mac());
        assertEquals("Mod+Alt+S",result.keybindings().get("toggleSidebar").windows());
        assertEquals("Mod+Alt+B",SettingsService.DEFAULT_KEYBINDINGS.get("toggleSidebar").windows());
    }
    @Test void capabilitiesIdentifyServerAndSupportedProtocol() {
        var controller = new DiagnosticsController(null,null,null,null,null,null,new BuildInformation("test-build"));
        var capabilities = controller.capabilities();
        assertEquals("test-build",capabilities.serverBuild());
        assertEquals(capabilities.build(),capabilities.serverBuild());
        assertEquals(1,capabilities.apiProtocolVersion());
        assertEquals(1,capabilities.minimumClientProtocolVersion());
        assertTrue(capabilities.authentication());
    }
    @Test void requestLogsAndResponsesKeepTheirBuildAndCorrelation() throws Exception {
        var filter = new RequestLoggingFilter(new BuildInformation("test-build"));
        var request = new MockHttpServletRequest("GET","/api/capabilities");
        request.addHeader("X-Request-ID","client-id");
        var response = new MockHttpServletResponse();
        filter.doFilter(request,response,(req,res)->{
            assertEquals("test-build",MDC.get("build"));
            assertEquals("client-id",MDC.get("requestId"));
        });
        assertEquals("client-id",response.getHeader("X-Request-ID"));
        assertNull(MDC.get("requestId"));
    }
    @Test void diagnosticsRetainSeparateVersionsAndBoundTheirText() {
        var controller = new DiagnosticsController(null,null,null,null,null,null,new BuildInformation("server"));
        controller.collect(java.util.List.of(new DiagnosticsController.Event("id","", "action","/", "x".repeat(1200),"","request","client","server",1,2)));
        var event = controller.recent().getFirst();
        assertEquals("client",event.build()); assertEquals("server",event.serverBuild());
        assertEquals(1,event.apiProtocolVersion()); assertEquals(1000,event.message().length());
    }
}
