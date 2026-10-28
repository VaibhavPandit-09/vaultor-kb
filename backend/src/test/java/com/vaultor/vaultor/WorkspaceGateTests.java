package com.vaultor.vaultor;
import com.vaultor.vaultor.service.WorkspaceGate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class WorkspaceGateTests {
    @Test void onlyTypedMaintenanceBecomesExpectedBusy(){
        var errors=new com.vaultor.vaultor.controller.ApiErrors();var gate=new WorkspaceGate();
        var typed=errors.handle(new com.vaultor.vaultor.controller.ApiErrors.WorkspaceBusy(gate.diagnostic()));assertEquals("WORKSPACE_BUSY",typed.getBody().getProperties().get("code"));assertNotNull(typed.getBody().getProperties().get("busy"));
        var ordinary=errors.handle(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Unrelated conflict"));assertEquals("CONFLICT",ordinary.getBody().getProperties().get("code"));
    }
    @Test void quiescingRefusesNewMutationsAndDrainsExistingOnesWithoutDiscarding() {
        var gate=new WorkspaceGate();assertTrue(gate.enterRequest());gate.quiesce();
        assertTrue(gate.busy());assertFalse(gate.requestsDrained());assertFalse(gate.enterRequest());
        gate.leaveRequest();assertTrue(gate.requestsDrained());gate.resume();
        assertFalse(gate.busy());assertTrue(gate.enterRequest());gate.leaveRequest();
    }
    @Test void transferAdmissionAllowsServiceExclusiveLockAndPreventsNewWorkDuringStop() {
        var gate=new WorkspaceGate();assertTrue(gate.enterTransferRequest());
        gate.exclusive(()->{});gate.quiesce();assertFalse(gate.requestsDrained());assertFalse(gate.enterTransferRequest());
        gate.leaveTransferRequest();assertTrue(gate.requestsDrained());gate.resume();assertTrue(gate.enterTransferRequest());gate.leaveTransferRequest();
    }
}
