package com.vaultor.vaultor.service;

import com.vaultor.vaultor.host.HostAccess;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;
import java.util.concurrent.*;

/** Invalidation metadata only. One bounded replay log per process; never documents or credentials. */
@Service
public class ChangeFeed {
    public record Event(String cursor, String kind, List<String> ids, String requestId, long at, String generation) {}
    private record Client(SseEmitter emitter, String deviceId) {}
    private final String epoch = UUID.randomUUID().toString();
    private long sequence;
    private final Deque<Event> replay = new ArrayDeque<>();
    private final Set<Client> clients = new HashSet<>();
    private final HostAccess access;
    private final WorkspaceIdentityService identity;
    private final ThreadPoolExecutor delivery = new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(128),r->{var t=new Thread(r,"change-feed-delivery");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {var t=new Thread(r,"workspace-change-feed");t.setDaemon(true);return t;});
    public ChangeFeed(HostAccess access,WorkspaceIdentityService identity) {
        this.access=access;this.identity=identity;
        scheduler.scheduleWithFixedDelay(this::heartbeat, 5, 5, TimeUnit.SECONDS);
    }
    public void committed(String kind, List<String> ids, String requestId) {
        var safeIds=ids==null || ids.size()>100?List.<String>of():List.copyOf(ids);
        Runnable publish=()->{try{publish(kind,safeIds,requestId,identity.current().generation());}catch(Exception ignored){/* Notification failure can never roll back or misreport a committed mutation. Reconnect resets metadata. */}};
        if(TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){publish.run();}});
        else publish.run();
    }
    private synchronized void trim() {long cutoff=System.currentTimeMillis()-600_000;while(!replay.isEmpty() && (replay.size()>1000 || replay.peekFirst().at()<cutoff))replay.removeFirst();}
    private synchronized void publish(String kind,List<String> ids,String requestId,String generation) {
        Event event=new Event(epoch+":"+(++sequence),kind,ids,requestId==null?"":requestId,System.currentTimeMillis(),generation);
        replay.addLast(event);trim();
        for(var client:List.copyOf(clients)) send(client,event);
    }
    public SseEmitter connect(String cursor,String deviceId) {
        String generation=identity.current().generation();
        return connect(cursor,deviceId,generation);
    }
    private synchronized SseEmitter connect(String cursor,String deviceId,String generation) {
        if(clients.size()>=64)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"Too many change streams; close an unused client.");
        trim();var emitter=new SseEmitter(120_000L);var client=new Client(emitter,deviceId);clients.add(client);
        Runnable remove=()->{synchronized(this){clients.remove(client);}};
        emitter.onCompletion(remove);emitter.onTimeout(remove);emitter.onError(e->remove.run());
        boolean valid=cursor!=null && cursor.startsWith(epoch+":");long from=-1;
        try{if(valid)from=Long.parseLong(cursor.substring(epoch.length()+1));}catch(Exception ignored){valid=false;}
        valid=valid && from<=sequence && from>= (replay.isEmpty()?sequence:Long.parseLong(replay.peekFirst().cursor().substring(epoch.length()+1))-1);
        valid=valid && sequence-from<=64;
        if(!valid)send(client,new Event(epoch+":"+sequence,"reset",List.of(),"",System.currentTimeMillis(),generation));
        else for(var event:replay)if(Long.parseLong(event.cursor().substring(epoch.length()+1))>from)send(client,event);
        return emitter;
    }
    private void send(Client client,Event event) {
        try{delivery.execute(()->deliver(client,event));}catch(RejectedExecutionException e){clients.remove(client);client.emitter().complete();}
    }
    private void deliver(Client client,Event event) {
        if(client.deviceId()!=null && !access.deviceActive(client.deviceId())){remove(client);return;}
        try{client.emitter().send(SseEmitter.event().id(event.cursor()).name("change").data(event));}
        catch(Exception e){remove(client);}
    }
    private synchronized void remove(Client client){clients.remove(client);client.emitter().complete();}
    @org.springframework.context.event.EventListener public synchronized void revoked(HostAccess.DeviceRevoked event){for(var client:List.copyOf(clients))if(event.id().equals(client.deviceId()))remove(client);}
    private synchronized void heartbeat() {
        for(var client:List.copyOf(clients)) {
            if(client.deviceId()!=null && !access.deviceActive(client.deviceId())){clients.remove(client);client.emitter().complete();continue;}
            try{delivery.execute(()->{try{client.emitter().send(SseEmitter.event().comment("keepalive"));}catch(Exception e){remove(client);}});}catch(RejectedExecutionException e){remove(client);}
        }
    }
    public void restarting(){committed("host-restart",List.of(),"");scheduler.schedule(this::disconnect,200,TimeUnit.MILLISECONDS);}
    private synchronized void disconnect(){for(var client:List.copyOf(clients))client.emitter().complete();clients.clear();}
    @PreDestroy public synchronized void stop() {scheduler.shutdownNow();delivery.shutdownNow();for(var client:List.copyOf(clients))client.emitter().complete();clients.clear();}
}
