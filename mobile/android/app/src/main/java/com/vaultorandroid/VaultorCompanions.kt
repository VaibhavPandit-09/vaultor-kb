package com.vaultorandroid

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.ConnectivityManager
import android.os.BatteryManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

/** Retained reading data, never credentials or recovery. A transaction switches the
 * active dataset only after every selected payload and manifest has been verified. */
class VaultorCompanions(private val ctx:Context,
  private val connection:(JSONObject,String,String)->HttpsURLConnection,
  private val valid:(JSONObject)->Unit,
  private val changed:(String)->Unit = {}) {
  private class Owner {val busy=AtomicBoolean(false);val cancel=AtomicBoolean(false);@Volatile var connection:HttpsURLConnection?=null}
  companion object {private val owners=java.util.concurrent.ConcurrentHashMap<String,Owner>()}
  private val root=File(ctx.noBackupFilesDir,"companions-v1").apply {check(mkdirs() || isDirectory)}
  private val owner=owners.getOrPut(root.canonicalPath){Owner()}
  private val db=object:SQLiteOpenHelper(ctx,File(root,"catalog.db").path,null,3) {
    override fun onCreate(d:SQLiteDatabase) {
      d.execSQL("CREATE TABLE sources(scope TEXT PRIMARY KEY, active TEXT, locked INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL)")
      d.execSQL("CREATE TABLE jobs(id TEXT PRIMARY KEY, scope TEXT NOT NULL, selection TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, organization TEXT)")
      d.execSQL("CREATE TABLE resources(job TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,titlekey TEXT NOT NULL,kind TEXT NOT NULL,category TEXT NOT NULL,favorite INTEGER NOT NULL,available INTEGER NOT NULL,updated TEXT NOT NULL,recent TEXT NOT NULL,search TEXT NOT NULL DEFAULT '',entry TEXT NOT NULL, PRIMARY KEY(job,id))")
      d.execSQL("CREATE INDEX resource_job ON resources(job)")
      d.execSQL("CREATE TABLE collections(job TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,titlekey TEXT NOT NULL,favorite INTEGER NOT NULL,entry TEXT NOT NULL,PRIMARY KEY(job,id))")
      d.execSQL("CREATE TABLE members(job TEXT NOT NULL,resource TEXT NOT NULL,collection TEXT NOT NULL,PRIMARY KEY(job,resource,collection))")
      d.execSQL("CREATE TABLE coverage(job TEXT NOT NULL,id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(job,id))")
    }
    override fun onUpgrade(d:SQLiteDatabase,old:Int,new:Int) {require(old in 1..2 && new==3){"Unsupported companion migration. Retained data is unchanged."};if(old==1)d.execSQL("CREATE TABLE coverage(job TEXT NOT NULL,id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(job,id))");d.execSQL("ALTER TABLE jobs ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0");d.rawQuery("SELECT id FROM jobs",null).use {c->while(c.moveToNext()){val id=UUID.fromString(c.getString(0)).toString();val bytes=File(root,id).walkTopDown().filter {it.isFile}.sumOf {it.length()};d.execSQL("UPDATE jobs SET bytes=? WHERE id=?",arrayOf<Any>(bytes,id))}}}
  }.apply {setWriteAheadLoggingEnabled(true)}.writableDatabase
  private val worker=Executors.newSingleThreadExecutor()
  private val busy=owner.busy
  private val cancel=owner.cancel
  private var current:HttpsURLConnection?
    get()=owner.connection
    set(value){owner.connection=value}
  private val prefs=ctx.getSharedPreferences("companion-policy-v1",Context.MODE_PRIVATE)
  init {
    db.execSQL("PRAGMA synchronous=FULL")
    // Interrupted jobs are resumable; orphan cleanup is restricted to UUID children
    // of this fixed private root, never recovery or media directories.
    if(!busy.get())db.execSQL("UPDATE jobs SET status='paused',detail='Interrupted download. Resume verified bytes.' WHERE status='downloading'")
    val known=rows("SELECT id FROM jobs").map {it.getString("id")}.toSet()
    root.listFiles()?.filter {it.isDirectory && it.name.matches(Regex("[a-f0-9-]{36}")) && it.name !in known}?.forEach {it.deleteRecursively()}
  }
  private fun category(mime:String):String=when {mime.startsWith("image/")->"image";mime=="application/pdf"->"pdf";mime.startsWith("text/")->"text";mime.startsWith("audio/")->"audio";mime.startsWith("video/")->"video";else->"other"}
  private fun syncDirectory(dir:File) {require(dir.isDirectory);val fd=android.system.Os.open(dir.path,android.system.OsConstants.O_RDONLY,0);try {android.system.Os.fsync(fd)}finally {android.system.Os.close(fd)}}
  private fun hash(f:File):String {val digest=MessageDigest.getInstance("SHA-256");f.inputStream().use {input->val b=ByteArray(262144);while(true){val n=input.read(b);if(n<0)break;digest.update(b,0,n)}};return digest.digest().joinToString(""){"%02x".format(it)}}
  private fun transaction(f:()->Unit) {db.beginTransaction();try {f();db.setTransactionSuccessful()}finally {db.endTransaction()}}
  private fun rows(sql:String,args:Array<String> = emptyArray()):List<JSONObject> = db.rawQuery(sql,args).use {c->buildList {while(c.moveToNext()) {add(JSONObject().also {v->for(i in 0 until c.columnCount)if(!c.isNull(i))v.put(c.getColumnName(i),c.getString(i))})}}}
  private fun job(id:String)=rows("SELECT * FROM jobs WHERE id=?",arrayOf(id)).firstOrNull() ?: error("Download not found.")
  private fun update(id:String,vararg values:Pair<String,Any>) {val v=ContentValues();values.forEach {(k,x)->when(x){is Long->v.put(k,x);is Int->v.put(k,x);else->v.put(k,x.toString())}};db.update("jobs",v,"id=?",arrayOf(id))}
  fun policy():JSONObject=JSONObject().put("budgetMiB",prefs.getInt("budgetMiB",512)).put("metered",prefs.getBoolean("metered",false)).put("lowBattery",prefs.getBoolean("lowBattery",false)).put("autoRefresh",prefs.getBoolean("autoRefresh",false))
  fun policy(a:JSONObject):JSONObject {val b=a.optInt("budgetMiB",512);require(b in 64..2048);check(prefs.edit().putInt("budgetMiB",b).putBoolean("metered",a.optBoolean("metered")).putBoolean("lowBattery",a.optBoolean("lowBattery")).putBoolean("autoRefresh",a.optBoolean("autoRefresh")).commit());return policy()}
  private fun networkPolicy() {
    val cm=ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    require(prefs.getBoolean("metered",false) || !cm.isActiveNetworkMetered) {"Download paused on a metered network. Allow metered downloads or connect to Wi-Fi."}
    val battery=ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val level=battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    require(prefs.getBoolean("lowBattery",false) || level<0 || level>15 || battery.isCharging) {"Download paused below 15% battery. Charge or allow low-battery downloads."}
  }
  private fun guard(a:JSONObject) {check(!cancel.get()) {"Download paused. Resume when ready."};valid(a);networkPolicy()}
  private fun scope(a:JSONObject):String {val s=a.getString("scope");val parts=JSONArray(s);require(parts.length()==3 && parts.getString(0)==a.getString("hostId") && (1..2).all {parts.getString(it).length in 1..100});return s}
  private fun used():Long=root.walkTopDown().filter {it.isFile}.sumOf {it.length()}
  private var accountedBytes=0L
  private fun room(extra:Long) {require(extra>=0 && accountedBytes+extra<=prefs.getInt("budgetMiB",512)*1048576L && root.usableSpace>extra+16*1048576L) {"Not enough download storage. Previous downloads and pending work remain. Increase budget or remove a download."};accountedBytes+=extra}
  private fun call(a:JSONObject,path:String,method:String="GET",body:JSONObject?=null,pin:String?=null,retry:Int=0):JSONObject {
    guard(a);val c=connection(a,path,method);current=c
    try {if(pin!=null)c.setRequestProperty("If-Match","\"$pin\"");if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use {it.write(body.toString().toByteArray())}}
      val status=c.responseCode
      if(status in listOf(401,403)){lock(a.getString("scope"));error("Access revoked. This companion is locked; retained recovery is separate.")}
      val bytes=(if(status in 200..299)c.inputStream else c.errorStream)?.use {it.readNBytes(1500001)} ?: ByteArray(0)
      require(bytes.size<=1500000){"Checkpoint metadata page exceeds the Android limit."}
      val value=if(bytes.isEmpty())JSONObject() else JSONObject(String(bytes,Charsets.UTF_8))
      if(status==409 && value.optString("code")=="WORKSPACE_BUSY" && retry<40) {guard(a);c.disconnect();Thread.sleep(350);return call(a,path,method,body,pin,retry+1)}
      if(value.optString("code")=="COMPANION_GENERATION_CHANGED") {lock(a.getString("scope"));error("Workspace replaced. Former reading copy is locked; pending recovery remains separate.")}
      require(status in 200..299){value.optString("detail","Host refused download ($status). Retry when connected.").take(180)}
      guard(a);return value
    }finally {if(current===c)current=null;c.disconnect()}
  }
  private fun selection(a:JSONObject):JSONObject {
    val parts=JSONArray(scope(a));val input=a.getJSONObject("selection");val kind=input.getString("scope");require(kind in listOf("workspace","collections","resources"))
    val ids=input.optJSONArray("ids") ?: JSONArray();require(if(kind=="workspace")ids.length()==0 else ids.length() in 1..100)
    val normalized=(0 until ids.length()).map {UUID.fromString(ids.getString(it)).toString()}.distinct().sorted()
    val dependencies=input.optString("dependencies","images");require(dependencies in listOf("none","images","linked"))
    val files=input.optString("files","readable");require(files in listOf("readable","originals"))
    return JSONObject().put("generation",parts.getString(2)).put("scope",kind).put("ids",JSONArray(normalized)).put("dependencies",dependencies).put("files",files)
  }
  fun estimate(a:JSONObject):JSONObject {check(busy.compareAndSet(false,true)) {"A download is running. Pause it before estimating another."};cancel.set(false);try {require(call(a,"/capabilities").optInt("companionSnapshots")>=1){"Update this host to 0.11.0 or later for offline downloads."};return call(a,"/companions/estimate","POST",selection(a))}finally {current?.disconnect();current=null;busy.set(false)}}
  fun start(a:JSONObject):JSONObject {
    val s=scope(a);val selection=selection(a)
    check(busy.compareAndSet(false,true)) {"A download is already running. Pause it before starting another."};cancel.set(false)
    accountedBytes=used()
    val existing=rows("SELECT * FROM jobs WHERE scope=? AND selection=? AND status NOT IN ('ready','expired') ORDER BY at DESC LIMIT 1",arrayOf(s,selection.toString())).firstOrNull()
    val id=existing?.getString("id") ?: UUID.randomUUID().toString()
    try {
      if(existing==null){require(rows("SELECT id FROM jobs").size<32){"32 retained downloads reached. Remove an incomplete download first."};require(rows("SELECT scope FROM sources WHERE active IS NOT NULL OR EXISTS(SELECT 1 FROM jobs WHERE jobs.scope=sources.scope)").size<8 || rows("SELECT scope FROM sources WHERE scope=? AND (active IS NOT NULL OR EXISTS(SELECT 1 FROM jobs WHERE jobs.scope=sources.scope))",arrayOf(s)).isNotEmpty()){ "Eight companions reached. Remove an unused download first." };room(1048576)
        db.execSQL("INSERT OR IGNORE INTO sources(scope,name) VALUES(?,?)",arrayOf(s,a.optString("name","Downloaded workspace").take(500)))
        db.execSQL("INSERT INTO jobs(id,scope,selection,status,at) VALUES(?,?,?,'paused',?)",arrayOf<Any>(id,s,selection.toString(),System.currentTimeMillis()))
      }
      update(id,"status" to "downloading","detail" to "Preparing checkpoint…","bytes" to File(root,id).walkTopDown().filter {it.isFile}.sumOf {it.length()})
      worker.execute {try {download(a,id,selection)}catch(e:Exception){update(id,"status" to (if(job(id).optString("status")=="expired")"expired" else "paused"),"detail" to (e.message?.take(180) ?: "Download interrupted. Previous reading copy remains; resume."))}finally {current?.disconnect();current=null;busy.set(false)}}
      return JSONObject().put("id",id)
    }catch(e:Exception){busy.set(false);throw e}
  }
  fun pause():JSONObject {cancel.set(true);current?.disconnect();return JSONObject()}
  private fun payload(a:JSONObject,id:String,key:String,descriptor:JSONObject,pin:String):File {
    require(key.matches(Regex("(?:[a-f0-9-]{36}\\.(?:json|bin)|organization\\.json|manifest\\.json)")))
    val length=descriptor.getLong("bytes");val expected=descriptor.getString("sha256");require(length in 0..67108864 && expected.matches(Regex("[a-f0-9]{64}")))
    val dir=File(root,id).apply {check(mkdirs() || isDirectory)};val target=File(dir,key);val part=File(dir,"$key.part")
    if(target.exists() && target.length()==length && hash(target)==expected)return target
    target.delete();if(part.length()>length)part.delete()
    var offset=part.length();val startOffset=offset;val baseBytes=job(id).optLong("bytes");room(length-offset)
    if(length==0L && !part.exists())java.io.FileOutputStream(part).use {it.fd.sync()}
    if(offset<length){guard(a);val c=connection(a,"/companions/$id/payloads/$key","GET");current=c
      try {c.setRequestProperty("If-Match","\"$pin\"");if(offset>0)c.setRequestProperty("Range","bytes=$offset-")
        val status=c.responseCode
        if(status in listOf(401,403)){lock(a.getString("scope"));error("Access revoked. Companion locked.")}
        require(status==(if(offset>0)206 else 200)) {"Download interrupted ($status). Retry the same checkpoint."}
        require(c.getHeaderField("X-Vaultor-SHA256")==expected) {"Payload identity differs. Retained checkpoint was not changed."}
        if(offset>0)require(c.getHeaderField("Content-Range")=="bytes $offset-${length-1}/$length") {"Invalid download range."}
        java.io.FileOutputStream(part,true).use {out->c.inputStream.use {input->val b=ByteArray(262144);var progress=offset/1048576;while(true){guard(a);val n=input.read(b);if(n<0)break;require(offset+n<=length){"Payload exceeds advertised length."};out.write(b,0,n);offset+=n;if(offset/1048576!=progress){progress=offset/1048576;update(id,"detail" to "Downloading $progress / ${(length+1048575)/1048576} MiB","bytes" to baseBytes+offset-startOffset)}};out.fd.sync()}}
      }finally {if(current===c)current=null;c.disconnect()}
    }
    if(part.length()!=length || hash(part)!=expected){part.delete();error("Downloaded bytes failed verification. Retry; previous copy remains.")}
    check(part.renameTo(target));update(id,"bytes" to baseBytes+length-startOffset);return target
  }
  private fun download(a:JSONObject,id:String,selection:JSONObject) {
    val caps=call(a,"/capabilities");require(caps.optInt("companionSnapshots")>=1){"Update this host to 0.11.0 or later for offline downloads."}
    fun identity() {val identity=call(a,"/workspace/identity");val source=JSONArray(a.getString("scope"));if(identity.getString("id")!=source.getString(1) || identity.getString("generation")!=source.getString(2)){lock(a.getString("scope"));error("Workspace replaced. Reconnect; former reading copy remains locked.")}}
    identity()
    // Verified local copies no longer need the host's short-lived byte cache.
    for(old in rows("SELECT id FROM jobs WHERE scope=? AND status='ready'",arrayOf(a.getString("scope"))))try {call(a,"/companions/${old.getString("id")}","DELETE",retry=40)}catch(_:Exception) {guard(a)}
    var receipt=call(a,"/companions/$id","PUT",selection)
    while(receipt.optString("status") in listOf("QUEUED","RUNNING")){guard(a);Thread.sleep(400);receipt=call(a,"/companions/$id")}
    if(receipt.optString("status")!="READY"){update(id,"status" to "expired");error("Checkpoint ${receipt.optString("status")}. Retry prepares a new checkpoint; previous reading copy remains.")}
    val pin=receipt.getString("manifestSha256");require(pin.matches(Regex("[a-f0-9]{64}")))
    val count=receipt.getInt("resources");require(count in 0..10000);update(id,"hash" to pin,"total" to count)
    // The exact canonical manifest is verified independently; never parse a 64 MiB manifest into JS.
    val manifestConnection=connection(a,"/companions/$id/payloads/manifest.json","GET")
    val manifestLength:Long
    try {manifestConnection.setRequestProperty("If-Match","\"$pin\"");require(manifestConnection.responseCode==200);manifestLength=manifestConnection.contentLengthLong;require(manifestLength in 1..67108864)}finally {manifestConnection.disconnect()}
    val manifest=payload(a,id,"manifest.json",JSONObject().put("bytes",manifestLength).put("sha256",pin),pin)
    android.util.JsonReader(manifest.reader()).use {reader->val seen=mutableSetOf<String>();val source=JSONArray(a.getString("scope"));reader.beginObject();while(reader.hasNext())when(val name=reader.nextName()){
      "version"->{require(reader.nextInt()==1){"Unsupported reading manifest. Update the client before downloading."};seen.add(name)}
      "id","workspaceId","generation"->{val expected=when(name){"id"->id;"workspaceId"->source.getString(1);else->source.getString(2)};require(reader.nextString()==expected){"Reading manifest source differs."};seen.add(name)}
      else->reader.skipValue()
    };reader.endObject();require(seen.size==4){"Reading manifest identity is incomplete."}}
    var page=0;var done=0;var omittedOriginals=0;var organization:JSONObject?=null
    do {val inventory=call(a,"/companions/$id/inventory?page=$page&size=25",pin=pin)
      require(inventory.getString("manifestSha256")==pin && inventory.getString("generation")==selection.getString("generation") && inventory.getInt("totalItems")==count)
      organization=inventory.getJSONObject("organization")
      val entries=inventory.getJSONArray("items");require(entries.length()<=25)
      for(i in 0 until entries.length()){guard(a);val e=entries.getJSONObject(i);val rid=UUID.fromString(e.getString("id")).toString();var text="";if(e.optString("type")=="file" && e.optJSONObject("binary")?.optString("state")!="available")omittedOriginals++
        for(name in listOf("document","binary")){val descriptor=e.optJSONObject(name) ?: continue;if(descriptor.optString("state")!="available")continue
          val key=descriptor.getString("key");require(key=="$rid.${if(name=="document")"json" else "bin"}")
          val f=payload(a,id,key,descriptor,pin)
          if(name=="document"){require(f.length()<=1048576);val doc=JSONObject(f.readText());text=savedText(doc)}
        }
        if(rows("SELECT id FROM resources WHERE job=? AND id=?",arrayOf(id,rid)).isEmpty())room(e.toString().length*2L+text.length*2L+4096)
        val v=ContentValues().apply {put("job",id);put("id",rid);put("title",e.getString("title"));put("titlekey",e.getString("title").lowercase());put("kind",e.getString("type"));put("category",category(e.optString("mimeType")));put("favorite",if(e.optBoolean("favorite"))1 else 0);put("available",if(e.optString("state")=="available")1 else 0);put("updated",e.optString("updatedAt"));put("recent",e.optString("lastOpenedAt").takeUnless {it=="null"} ?: "");put("search",text.lowercase());put("entry",e.toString())}
        transaction {db.insertWithOnConflict("resources",null,v,SQLiteDatabase.CONFLICT_REPLACE);db.delete("members","job=? AND resource=?",arrayOf(id,rid));val memberships=e.optJSONArray("collections") ?: JSONArray();for(j in 0 until memberships.length())db.execSQL("INSERT OR IGNORE INTO members(job,resource,collection) VALUES(?,?,?)",arrayOf(id,rid,memberships.getJSONObject(j).getString("id")))}
        update(id,"done" to ++done,"detail" to "Verified $done of $count resources")
      };page++
    }while(page<inventory.getInt("totalPages"))
    require(done==count)
    val org=organization ?: error("Missing organization metadata.")
    val orgFile=payload(a,id,org.getString("key"),org,pin);require(orgFile.length()<=8388608) {"Organization exceeds the mobile 8 MiB limit."}
    val orgText=orgFile.readText();val orgValue=JSONObject(orgText);require(orgValue.getJSONArray("collections").length()<=10000)
    transaction {db.delete("collections","job=?",arrayOf(id));val collections=orgValue.getJSONArray("collections");for(i in 0 until collections.length()){val c=collections.getJSONObject(i);val count=c.getJSONArray("resources").length();val title=c.getString("name");val entry=JSONObject().put("id",c.getString("id")).put("name",title).put("favorite",c.optBoolean("favorite")).put("resourceCount",count).put("count",count)
      db.execSQL("INSERT INTO collections(job,id,title,titlekey,favorite,entry) VALUES(?,?,?,?,?,?)",arrayOf<Any>(id,c.getString("id"),title,title.lowercase(),if(c.optBoolean("favorite"))1 else 0,entry.toString()))}}
    // Coverage is stored independently so unselected/missing outgoing targets remain identifiable.
    var coveragePage=0;var omissions=0
    do {val coverage=call(a,"/companions/$id/coverage?page=$coveragePage&size=100",pin=pin);val items=coverage.getJSONArray("items");require(items.length()<=100);omissions+=items.length();require(omissions<=20000);transaction {for(i in 0 until items.length()){val e=items.getJSONObject(i);db.execSQL("INSERT OR REPLACE INTO coverage(job,id,reason) VALUES(?,?,?)",arrayOf(id,UUID.fromString(e.getString("id")).toString(),e.getString("reason").take(180)))}};coveragePage++}while(coveragePage<coverage.getInt("totalPages"))
    guard(a);identity();syncDirectory(File(root,id));syncDirectory(root)
    val previous=rows("SELECT active FROM sources WHERE scope=?",arrayOf(a.getString("scope"))).firstOrNull()?.optString("active")
    transaction {update(id,"status" to "ready","organization" to orgText,"at" to System.currentTimeMillis(),"detail" to "$count resources · $omittedOriginals originals not downloaded · $omissions unavailable/unselected links")
      db.execSQL("UPDATE sources SET active=?,locked=0 WHERE scope=?",arrayOf(id,a.getString("scope"))) }
    if(!previous.isNullOrEmpty() && previous!=id)deleteJob(previous)
    try {changed(a.getString("scope"))}catch(_:Exception){ /* Cold restoration reads the committed pointer. */ }
    try {call(a,"/companions/$id","DELETE",retry=40)}catch(_:Exception){ /* Host expiry cleans up an unavailable cache; local bytes stay verified. */ }
  }
  private fun savedText(doc:JSONObject):String {val out=StringBuilder();fun visit(n:JSONObject,depth:Int){if(depth>64 || out.length>=1048576)return;n.optString("text").takeIf {it.isNotEmpty()}?.let {out.append(it).append(' ')};n.optJSONObject("attrs")?.let {at->for(k in listOf("caption","alt","label"))out.append(at.optString(k)).append(' ')};val c=n.optJSONArray("content");if(c!=null)for(i in 0 until c.length())visit(c.getJSONObject(i),depth+1)};visit(doc,0);return out.take(1048576).toString()}
  fun list():JSONArray=JSONArray(rows("SELECT j.*,s.active,s.locked,s.name FROM jobs j JOIN sources s ON s.scope=j.scope ORDER BY j.at DESC").map {if(!busy.get() && it.optString("status")=="downloading")it.put("status","paused");it.put("bytes",it.optLong("bytes")).put("workerActive",busy.get());it})
  fun available(host:String,workspace:String):JSONObject?=rows("SELECT s.*,j.at,j.detail FROM sources s JOIN jobs j ON s.active=j.id WHERE s.locked=0 ORDER BY j.at DESC").firstOrNull {val parts=JSONArray(it.getString("scope"));parts.getString(0)==host && (workspace.isEmpty() || parts.getString(1)==workspace)}
  fun blocked(host:String,workspace:String):JSONObject?=rows("SELECT scope FROM sources WHERE locked=1").firstOrNull {val parts=JSONArray(it.getString("scope"));parts.getString(0)==host && (workspace.isEmpty() || parts.getString(1)==workspace)}?.put("locked",true)
  fun isLocked(scope:String)=rows("SELECT locked FROM sources WHERE scope=?",arrayOf(scope)).firstOrNull()?.optString("locked")=="1"
  fun lock(scope:String) {db.execSQL("UPDATE sources SET locked=1 WHERE scope=?",arrayOf(scope));try {changed(scope)}catch(_:Exception){}}
  fun observe(host:String,workspace:String,generation:String?=null,revoked:Boolean=false) {rows("SELECT scope FROM sources").forEach {r->val s=r.getString("scope");val p=JSONArray(s);if(p.getString(0)==host && (workspace.isEmpty() || p.getString(1)==workspace) && (revoked || (generation!=null && p.getString(2)!=generation)))lock(s)}}
  private fun active(scope:String):String=rows("SELECT active FROM sources WHERE scope=? AND locked=0",arrayOf(scope)).firstOrNull()?.optString("active")?.takeIf {it.isNotEmpty()} ?: error("No unlocked downloaded reading copy for this workspace.")
  fun file(scope:String,id:String):File? {val job=active(scope);val e=rows("SELECT entry FROM resources WHERE job=? AND id=?",arrayOf(job,id)).firstOrNull()?.let {JSONObject(it.getString("entry"))} ?: return null;val b=e.optJSONObject("binary") ?: return null;if(b.optString("state")!="available")return null;val f=File(File(root,job),"$id.bin");require(f.length()==b.getLong("bytes") && hash(f)==b.getString("sha256")) {"Downloaded original is damaged. Refresh this companion."};return f}
  fun query(scope:String,path:String):JSONObject {
    val job=active(scope);val uri=URI(path);val route=uri.path;require(uri.scheme==null && uri.rawAuthority==null && uri.fragment==null)
    val params=uri.rawQuery.orEmpty().split('&').filter {it.isNotEmpty()}.associate {val p=it.split('=',limit=2);java.net.URLDecoder.decode(p[0],"UTF-8") to java.net.URLDecoder.decode(p.getOrElse(1){""},"UTF-8")}
    val entryId=Regex("/resources/([a-fA-F0-9-]{36})(?:/summary)?").matchEntire(route)?.groupValues?.get(1)
    if(entryId!=null){val row=rows("SELECT entry FROM resources WHERE job=? AND id=?",arrayOf(job,entryId)).firstOrNull() ?: error("Not downloaded. Connect and include this resource; the current note remains open.");val e=JSONObject(row.getString("entry"));require(e.optString("state")=="available"){"Resource unavailable in this reading copy."};if(!route.endsWith("/summary") && e.getString("type")=="note"){val d=e.getJSONObject("document");val f=File(File(root,job),"$entryId.json");require(hash(f)==d.getString("sha256"));e.put("content",JSONObject(f.readText()))};return e}
    require(route in listOf("/resources","/resources/query","/collections","/organization/pins","/tags/browse")) {"This action requires a connected host."}
    val q=params["q"].orEmpty().take(500).lowercase();val type=params["type"] ?: params["kind"].orEmpty();val cat=params["category"].orEmpty();val collection=params["collection"];val content=route=="/resources/query";val favorite=route=="/organization/pins" || params["favorites"]=="true"
    val pattern="%"+q.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%"
    val binds=mutableListOf<String>();val selects=mutableListOf<String>()
    val resource=route !in listOf("/collections","/tags/browse") && type!="collection"
    val organization=route in listOf("/collections","/organization/pins") && type in listOf("","collection")
    if(resource) {
      val where=mutableListOf("job=?","available=1","(titlekey LIKE ? ESCAPE '\\'"+(if(content)" OR (kind='note' AND search LIKE ? ESCAPE '\\')" else "")+")")
      binds.add(job);binds.add(pattern);if(content)binds.add(pattern)
      if(type.isNotEmpty()){where.add("kind=?");binds.add(type)}
      if(cat.isNotEmpty()){where.add("category=?");binds.add(cat)}
      if(favorite)where.add("favorite=1")
      if(collection!=null){where.add("EXISTS(SELECT 1 FROM members m WHERE m.job=resources.job AND m.resource=resources.id AND m.collection=?)");binds.add(collection)}
      if(params["sort"]=="recent")where.add("recent!=''")
      selects.add("SELECT id,titlekey,updated,recent,entry,'resource' AS shortcut FROM resources WHERE "+where.joinToString(" AND "))
    }
    if(organization) {selects.add("SELECT id,titlekey,'' AS updated,'' AS recent,entry,'collection' AS shortcut FROM collections WHERE job=? AND titlekey LIKE ? ESCAPE '\\'"+(if(favorite)" AND favorite=1" else ""));binds.add(job);binds.add(pattern)}
    if(selects.isEmpty())return JSONObject().put("items",JSONArray()).put("totalItems",0).put("totalPages",0)
    val query=selects.joinToString(" UNION ALL ");val args=binds.toTypedArray()
    val total=db.rawQuery("SELECT count(*) FROM ($query)",args).use {it.moveToFirst();it.getInt(0)}
    val sort=if(route in listOf("/collections","/organization/pins"))"title" else params["sort"] ?: "updated"
    val order=when(sort){"title"->"titlekey ASC,id ASC";"recent"->"recent DESC,id ASC";else->"updated DESC,id ASC"}
    val size=(params["size"]?.toIntOrNull() ?: 100).coerceIn(1,100);val page=(params["page"]?.toIntOrNull() ?: 0).coerceIn(0,100000)
    val items=rows("SELECT entry,shortcut FROM ($query) ORDER BY $order LIMIT ? OFFSET ?",args+arrayOf(size.toString(),(page*size).toString())).map {row->val e=JSONObject(row.getString("entry"));if(route=="/organization/pins"){if(row.getString("shortcut")=="collection")e.put("kind","collection")else JSONObject().put("kind","resource").put("id",e.getString("id")).put("resource",e)}else e}
    return JSONObject().put("items",JSONArray(items)).put("page",page).put("size",size).put("totalItems",total).put("totalPages",(total+size-1)/size).put("downloadedOnly",true)
  }
  private fun deleteJob(id:String) {require(UUID.fromString(id).toString()==id);transaction {db.delete("resources","job=?",arrayOf(id));db.delete("collections","job=?",arrayOf(id));db.delete("members","job=?",arrayOf(id));db.delete("coverage","job=?",arrayOf(id));db.delete("jobs","id=?",arrayOf(id))};File(root,id).deleteRecursively() /* UUID child of fixed app-private root only. */}
  fun remove(id:String):JSONObject {check(!busy.get()) {"Pause the download before removal."};val j=job(id);transaction {db.execSQL("UPDATE sources SET active=NULL WHERE active=?",arrayOf(id));db.delete("resources","job=?",arrayOf(id));db.delete("collections","job=?",arrayOf(id));db.delete("members","job=?",arrayOf(id));db.delete("coverage","job=?",arrayOf(id));db.delete("jobs","id=?",arrayOf(id))};File(root,UUID.fromString(id).toString()).deleteRecursively();db.delete("sources","scope=? AND active IS NULL AND locked=0 AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.scope=sources.scope)",arrayOf(j.getString("scope")));return JSONObject()}
}
