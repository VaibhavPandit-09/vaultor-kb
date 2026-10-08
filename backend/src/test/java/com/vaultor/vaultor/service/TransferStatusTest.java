package com.vaultor.vaultor.service;
import com.vaultor.vaultor.model.TransferOperation;
import com.vaultor.vaultor.repository.TransferOperationRepository;
import org.junit.jupiter.api.*;
import org.mockito.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class TransferStatusTest {
 @Mock TransferOperationRepository operations;
 @InjectMocks TransferService service;
 AutoCloseable mocks;WorkspaceGate gate;
 @BeforeEach void setup(){mocks=MockitoAnnotations.openMocks(this);gate=new WorkspaceGate();ReflectionTestUtils.setField(service,"gate",gate);ReflectionTestUtils.setField(service,"mapper",new tools.jackson.databind.ObjectMapper());when(operations.save(any())).thenAnswer(i->i.getArgument(0));}
 @AfterEach void close()throws Exception{service.shutdown();mocks.close();}
 @Test void committedActiveSnapshotDoesNotBorrowRepositoryDuringExclusiveWork()throws Exception{
  var op=new TransferOperation();op.setKind("import");op.setStatus("RUNNING");op.setPhase("committing");op.setProgress(60);
  ReflectionTestUtils.invokeMethod(service,"saveOperationStatus",op);clearInvocations(operations);
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
  var worker=Thread.ofPlatform().start(()->gate.exclusive(()->{entered.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}}));
  try{assertTrue(entered.await(2,TimeUnit.SECONDS));op.setProgress(100);assertEquals(60,service.get(op.getId()).progress());assertEquals(1,service.activity());verifyNoInteractions(operations);assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.get(UUID.randomUUID().toString()));verifyNoInteractions(operations);}finally{release.countDown();worker.join();}
 }
 @Test void terminalSnapshotReturnsToDurableStorageAndFailedWritesNeverPublish(){
  var op=new TransferOperation();op.setKind("import");ReflectionTestUtils.invokeMethod(service,"saveOperationStatus",op);
  op.setStatus("SUCCEEDED");ReflectionTestUtils.invokeMethod(service,"saveOperationStatus",op);when(operations.findById(op.getId())).thenReturn(Optional.of(op));assertEquals("SUCCEEDED",service.get(op.getId()).status());verify(operations).findById(op.getId());
  op.setStatus("RUNNING");when(operations.save(op)).thenThrow(new IllegalStateException("disk unavailable"));assertThrows(IllegalStateException.class,()->ReflectionTestUtils.invokeMethod(service,"saveOperationStatus",op));clearInvocations(operations);service.get(op.getId());verify(operations).findById(op.getId());
 }
}
