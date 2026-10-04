package com.vaultor.vaultor;
import com.vaultor.vaultor.service.WorkspaceGate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class WorkspaceGateTests {
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
