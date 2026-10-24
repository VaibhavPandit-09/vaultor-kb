package vaultor.linked;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Handle notifications invalidate; periodic checks recover missed events.
 * No unbounded queue, automatic rebind, draft replacement or source writes. */
public final class ChangeMonitor implements AutoCloseable {
    private final LinkedStore store;
    private final LinkedStore.Scope scope;
    private final Map<Path,WindowsFiles.Notifications> directories=new HashMap<>();
    private final Set<String> documents=new HashSet<>();
    private final Map<String,LinkedStore.Change> latest=new ConcurrentHashMap<>();
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"linked-reconcile");t.setDaemon(true);return t;});
    private long last;
    private final long period;
    private boolean invalid=true,closed;
    public volatile long invalidations,rechecks;
    private final boolean notifications;

    public ChangeMonitor(LinkedStore store,LinkedStore.Scope scope,long period)throws IOException{this(store,scope,period,true);}
    ChangeMonitor(LinkedStore store,LinkedStore.Scope scope,long period,boolean notifications)throws IOException{
        if(period<50||period>10000)throw new IOException("WATCH_PERIOD");
        this.store=store;this.scope=scope;this.period=period;this.notifications=notifications;
        worker.scheduleWithFixedDelay(this::tick,25,25,TimeUnit.MILLISECONDS);
    }
    public synchronized void register(String document)throws IOException{
        if(closed)throw new IOException("WATCH_CLOSED");
        if(documents.size()>=64)throw new IOException("WATCH_DOCUMENT_LIMIT");
        Path parent=store.watchParent(scope,document);
        if(notifications&&!directories.containsKey(parent)){
            if(directories.size()>=64)throw new IOException("WATCH_DIRECTORY_LIMIT");
            directories.put(parent,store.watchDirectory(scope,document));
        }
        documents.add(document);invalid=true;
    }
    public synchronized void invalidate(){invalid=true;}
    public LinkedStore.Change latest(String document){return latest.get(document);}
    private synchronized void tick(){
        if(closed)return;
        for(var iterator=directories.values().iterator();iterator.hasNext();){
            var notification=iterator.next();
            try{if(notification.poll()){invalid=true;invalidations++;}}
            catch(IOException e){invalid=true;iterator.remove();try{notification.close();}catch(IOException ignored){} /* Polling remains authoritative. */}
        }
        long now=System.nanoTime();if(!invalid&&now-last<period*1_000_000L)return;invalid=false;last=now;
        for(String cap:documents){
            try{latest.put(cap,store.reconcile(scope,cap));}
            catch(IOException e){latest.put(cap,new LinkedStore.Change("RECHECK_FAILED",null,true,""));}
            rechecks++;
        }
    }
    public synchronized void close()throws IOException{
        if(closed)return;closed=true;worker.shutdownNow();IOException failure=null;
        for(var notification:directories.values())try{notification.close();}catch(IOException e){failure=e;}
        directories.clear();if(failure!=null)throw failure;
    }
}
