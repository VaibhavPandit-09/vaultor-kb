package com.vaultor.vaultor.service;
import org.springframework.stereotype.Component;
import java.util.concurrent.locks.ReentrantReadWriteLock;
@Component
public class WorkspaceGate {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock(true);
    private volatile boolean stopping;
    private final java.util.concurrent.atomic.AtomicInteger transferRequests=new java.util.concurrent.atomic.AtomicInteger();
    public boolean enterRequest() { if(stopping || !lock.readLock().tryLock())return false; if(stopping){lock.readLock().unlock();return false;}return true; }
    public synchronized void quiesce() { stopping=true; }
    // Transfers acquire the exclusive workspace lock inside their service; admission cannot hold a read lock.
    public synchronized boolean enterTransferRequest() { if(stopping)return false;transferRequests.incrementAndGet();return true; }
    public void leaveTransferRequest() { transferRequests.decrementAndGet(); }
    public void resume() { stopping=false; }
    public boolean requestsDrained() { return lock.getReadLockCount()==0 && transferRequests.get()==0; }
    public void leaveRequest() { lock.readLock().unlock(); }
    public void exclusive(Runnable work) { lock.writeLock().lock(); try { work.run(); } finally { lock.writeLock().unlock(); } }
    public boolean busy() { return stopping || lock.isWriteLocked(); }
}
