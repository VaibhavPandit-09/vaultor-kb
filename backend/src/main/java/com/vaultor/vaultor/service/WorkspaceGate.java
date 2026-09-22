package com.vaultor.vaultor.service;
import org.springframework.stereotype.Component;
import java.util.concurrent.locks.ReentrantReadWriteLock;
@Component
public class WorkspaceGate {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock(true);
    public boolean enterRequest() { return lock.readLock().tryLock(); }
    public void leaveRequest() { lock.readLock().unlock(); }
    public void exclusive(Runnable work) { lock.writeLock().lock(); try { work.run(); } finally { lock.writeLock().unlock(); } }
    public boolean busy() { return lock.isWriteLocked(); }
}
