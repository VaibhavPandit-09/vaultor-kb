package com.vaultor.vaultor.config;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.boot.web.server.context.WebServerApplicationContext;

/** Private stdio lifecycle, enabled only for a child launched by Electron. No HTTP control API. */
public final class DesktopOwner implements AutoCloseable {
    private final FileChannel channel;
    private final FileLock lock;
    private final String token;
    private final ProcessHandle parent;
    private final Instant parentStarted;
    private final AtomicBoolean closing = new AtomicBoolean();
    private volatile ConfigurableApplicationContext context;
    private DesktopOwner(FileChannel channel, FileLock lock, String token, ProcessHandle parent, Instant started) {
        this.channel = channel; this.lock = lock; this.token = token; this.parent = parent; this.parentStarted = started;
    }
    public static DesktopOwner acquire(Map<String,String> env) {
        var directory = env.get("VAULTOR_DESKTOP_DATA");
        if (directory == null) return null; // Standalone/Docker behavior is unchanged.
        FileChannel channel = null;
        try {
            var token = env.get("VAULTOR_OWNER_TOKEN");
            if (token == null || !token.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid desktop owner channel");
            var parent = ProcessHandle.of(Long.parseLong(env.get("VAULTOR_OWNER_PID"))).orElseThrow();
            var started = parent.info().startInstant().orElseThrow();
            if (!parent.isAlive() || ProcessHandle.current().parent().orElseThrow().pid() != parent.pid()) throw new IllegalArgumentException("Owner process changed");
            var root = Path.of(directory).toAbsolutePath().normalize();
            Files.createDirectories(root.resolve("files"));
            channel = FileChannel.open(root.resolve("workspace.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            var lock = channel.tryLock();
            if (lock == null) throw new IllegalStateException("Desktop workspace is already in use. Close its other host and retry.");
            var owner = new DesktopOwner(channel, lock, token, parent, started);
            Runtime.getRuntime().addShutdownHook(new Thread(owner::close, "desktop-data-unlock"));
            Thread.ofPlatform().daemon().name("desktop-owner-watchdog").start(() -> {
                try {
                    while (true) {
                        Thread.sleep(1000);
                        if (!parent.isAlive() || !parent.info().startInstant().orElse(Instant.EPOCH).equals(started)) {
                            // Startup has no context to close yet; exit runs the data-unlock hook.
                            if (owner.context == null) Runtime.getRuntime().exit(0); else owner.stop(false);
                            return;
                        }
                    }
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            return owner;
        } catch (Exception e) {
            if (channel != null) try { channel.close(); } catch (Exception ignored) {}
            throw new IllegalStateException("Desktop data ownership failed: " + e.getMessage(), e);
        }
    }
    public void ready(ConfigurableApplicationContext context) {
        this.context = context;
        var web = (WebServerApplicationContext) context;
        // Only the direct child's stdout carries this ephemeral proof; it is intercepted, never logged.
        System.out.println("VAULTOR_OWNER_READY " + token + " " + web.getWebServer().getPort());
        System.out.flush();
        Thread.ofPlatform().daemon().name("desktop-owner-control").start(() -> {
            try {
                var input = new BufferedReader(new InputStreamReader(System.in));
                for (String line; (line = input.readLine()) != null;) {
                    if (line.equals("STOP " + token)) { stop(true); if (closing.get()) return; }
                }
                stop(false); // EOF means the launcher disappeared.
            } catch (Exception e) { stop(false); }
        });
    }
    private void stop(boolean mayBlock) {
        if (!closing.compareAndSet(false, true)) return;
        var gate=context.getBean(com.vaultor.vaultor.service.WorkspaceGate.class);
        var operations=context.getBean(com.vaultor.vaultor.repository.TransferOperationRepository.class);
        gate.quiesce();long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
        try {
            while(System.nanoTime()<deadline) {
                if(gate.requestsDrained()) {
                    var count=new java.util.concurrent.FutureTask<Long>(() -> operations.countByStatusIn(java.util.List.of("QUEUED","RUNNING","CLEANUP")));
                    Thread.ofPlatform().daemon().start(count);
                    try { if(count.get(Math.max(1,Math.min(500,java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(deadline-System.nanoTime()))),java.util.concurrent.TimeUnit.MILLISECONDS)==0) {context.close();close();return;} }
                    catch(java.util.concurrent.TimeoutException timeout){count.cancel(true);}
                }
                Thread.sleep(100);
            }
        } catch(Exception ignored) { /* Preserve the host and unblock editing if safe stop fails. */ }
        if (!mayBlock) { Runtime.getRuntime().exit(0); return; }
        gate.resume();closing.set(false);System.out.println("VAULTOR_OWNER_BLOCKED "+token);System.out.flush();
    }
    public void close() { try { if (lock.isValid()) lock.release(); channel.close(); } catch (Exception ignored) {} }
}
