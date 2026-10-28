package com.vaultor.vaultor.service;
import org.springframework.stereotype.Component;
import java.util.concurrent.locks.ReentrantReadWriteLock;
@Component
public class WorkspaceGate {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock(true);
    private volatile boolean stopping;
    private volatile String owner="",phase="";
    private volatile long started;
    public record Busy(String owner,String phase,long durationMs,boolean stopping) {}
    public Busy diagnostic(){return new Busy(owner,stopping?"stopping":phase,started==0?0:(System.nanoTime()-started)/1_000_000,stopping);}
    private final java.util.concurrent.atomic.AtomicInteger transferRequests=new java.util.concurrent.atomic.AtomicInteger();
    public boolean enterRequest() { if(stopping || !lock.readLock().tryLock())return false; if(stopping){lock.readLock().unlock();return false;}return true; }
    public synchronized void quiesce() { stopping=true; }
    // Transfers acquire the exclusive workspace lock inside their service; admission cannot hold a read lock.
    public synchronized boolean enterTransferRequest() { if(stopping)return false;transferRequests.incrementAndGet();return true; }
    public void leaveTransferRequest() { transferRequests.decrementAndGet(); }
    public void resume() { stopping=false; }
    public boolean requestsDrained() { return lock.getReadLockCount()==0 && transferRequests.get()==0; }
    public void leaveRequest() { lock.readLock().unlock(); }
    public void exclusive(Runnable work) {String caller=StackWalker.getInstance().walk(frames->frames.filter(frame->!frame.getClassName().equals(WorkspaceGate.class.getName())).findFirst().map(frame->frame.getClassName().substring(frame.getClassName().lastIndexOf('.')+1)+"."+frame.getMethodName()).orElse("maintenance"));exclusive(caller,"maintenance",work);}
    public void exclusive(String operation,String stage,Runnable work) { lock.writeLock().lock();String previousOwner=owner,previousPhase=phase;long previousStart=started;owner=operation;phase=stage;started=System.nanoTime();try { work.run(); } finally {owner=previousOwner;phase=previousPhase;started=previousStart;lock.writeLock().unlock();} }
    public boolean busy() { return stopping || lock.isWriteLocked(); }
}
