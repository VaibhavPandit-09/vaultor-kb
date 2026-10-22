package com.vaultorandroid

import android.content.*
import android.database.sqlite.*
import android.net.Uri
import android.provider.OpenableColumns
import android.security.keystore.*
import android.util.Base64
import org.json.*
import java.io.*
import java.security.*
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.*
import javax.crypto.spec.GCMParameterSpec

/** Independent, protected import queue. No drafts, Review records or checkpoints are writable here. */
class VaultorImports private constructor(private val ctx:Context,fixtureRoot:File?=null) {
  companion object {
    const val ITEM=64L*1024*1024;const val COUNT=128;const val RESERVE=16L*1024*1024;const val CHUNK=262144
    @Volatile private var instance:VaultorImports?=null
    fun get(ctx:Context):VaultorImports=instance ?: synchronized(this){instance ?: VaultorImports(ctx.applicationContext).also {instance=it}}
    internal fun fixture(ctx:Context,root:File):VaultorImports {require(android.os.Build.HARDWARE=="ranchu"&&root.canonicalPath.startsWith(ctx.cacheDir.canonicalPath+File.separator));return VaultorImports(ctx,root)}
  }
  val worker=Executors.newSingleThreadExecutor()
  @Volatile var changed:(()->Unit)?=null
  val root=(fixtureRoot ?: File(ctx.noBackupFilesDir,"collected-imports-v1")).apply {check(mkdirs()||isDirectory)}
  private val prefs=ctx.getSharedPreferences(if(fixtureRoot==null)"collected-import-policy-v1" else "import-test-"+root.name,Context.MODE_PRIVATE)
  private val helper=object:SQLiteOpenHelper(ctx,File(root,"queue.sqlite").path,null,1){
    override fun onConfigure(db:SQLiteDatabase){db.execSQL("PRAGMA synchronous=FULL")}
    override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE items(id TEXT PRIMARY KEY,bytes INTEGER NOT NULL,data TEXT NOT NULL)");db.execSQL("CREATE TABLE acquisitions(id TEXT PRIMARY KEY)")}
    override fun onUpgrade(db:SQLiteDatabase,old:Int,next:Int){error("Unsupported import queue version; original bytes retained")}
  }
  private val db=helper.writableDatabase
  init {synchronized(this){for(row in rows()){if(row.optString("state")=="acquiring")save(row.put("state","acquisitionInterrupted").put("detail","Copy interrupted. Original provider may require selecting again; partial bytes remain until removal."))}}}
  private fun key():SecretKey {val ks=KeyStore.getInstance("AndroidKeyStore").apply {load(null)};val name="vaultor-collected-imports-v1";if(!ks.containsAlias(name))KeyGenerator.getInstance("AES","AndroidKeyStore").apply {init(KeyGenParameterSpec.Builder(name,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generateKey()};return ks.getKey(name,null) as SecretKey}
  private fun seal(bytes:ByteArray):ByteArray {val c=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.ENCRYPT_MODE,key())};return c.iv+c.doFinal(bytes)}
  private fun unseal(bytes:ByteArray):ByteArray {require(bytes.size>=28);val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));return c.doFinal(bytes.copyOfRange(12,bytes.size))}
  private fun encode(row:JSONObject)=Base64.encodeToString(seal(row.toString().toByteArray()),Base64.NO_WRAP)
  private fun decode(value:String)=JSONObject(String(unseal(Base64.decode(value,Base64.NO_WRAP)),Charsets.UTF_8))
  @Synchronized fun rows():List<JSONObject> {val out=ArrayList<JSONObject>();db.rawQuery("SELECT data FROM items ORDER BY rowid",null).use {while(it.moveToNext())out.add(decode(it.getString(0)))};return out}
  @Synchronized fun item(id:String)=rows().firstOrNull {it.getString("id")==id} ?: error("Import unavailable")
  @Synchronized fun save(row:JSONObject) {val v=ContentValues().apply {put("id",row.getString("id"));put("bytes",row.optLong("bytes"));put("data",encode(row))};check(db.insertWithOnConflict("items",null,v,SQLiteDatabase.CONFLICT_REPLACE)!=-1L);changed?.invoke()}
  fun policy()=JSONObject().put("budgetMiB",prefs.getInt("budgetMiB",256)).put("metered",prefs.getBoolean("metered",false)).put("itemMiB",64).put("maxItems",128).put("batchItems",8)
  @Synchronized fun policy(a:JSONObject):JSONObject{val budget=a.getInt("budgetMiB");require(budget in 64..2048){"Import storage budget must be 64–2048 MiB. Existing items are never evicted."};check(prefs.edit().putInt("budgetMiB",budget).putBoolean("metered",a.optBoolean("metered")).commit());return policy()}
  private fun usage()=root.listFiles()?.filter {it.isFile && (it.name.endsWith(".bin")||it.name.endsWith(".part"))}?.sumOf {it.length()} ?: 0L
  private fun room(extra:Long){require(usage()+extra<=prefs.getInt("budgetMiB",256)*1048576L && root.usableSpace>extra+RESERVE){"Private import storage is full. Remove a resolved input or increase the import budget; queued work is retained."}}
  private fun name(raw:String)=raw.replace(Regex("[\\\\/\\p{Cntrl}:*?\"<>|]"),"_").trim().trim('.').take(180).ifEmpty {"shared-input"}
  private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
  @Synchronized internal fun acquire(token:String,inputs:List<Pair<Uri?,String?>>,sharedText:String?):JSONObject {
    require(inputs.size+(if(sharedText!=null)1 else 0) in 1..8){"Choose at most eight inputs per acquisition."}
    db.rawQuery("SELECT id FROM acquisitions WHERE id=?",arrayOf(token)).use {if(it.moveToFirst())return JSONObject().put("retained",true)}
    // Dedup delivery before copy. Rows describe interrupted copies after death, never pretend success.
    val outcomes=JSONArray();val sources=inputs.toMutableList();if(sharedText!=null)sources.add(null to sharedText)
    val seeds=sources.map {JSONObject().put("id",UUID.randomUUID().toString()).put("acquisition",token).put("filename","Input awaiting acquisition").put("mime","application/octet-stream").put("bytes",0).put("state","acquiring").put("createdAt",System.currentTimeMillis()).put("detail","Copy pending; original bytes not yet protected")}
    db.beginTransaction();try{require(rows().size+seeds.size<=COUNT){"128 retained imports reached. Resolve or remove an item first."};check(db.insertOrThrow("acquisitions",null,ContentValues().apply {put("id",token)})!=-1L);seeds.forEach {save(it)};db.setTransactionSuccessful()}finally{db.endTransaction()}
    for((index,pair) in sources.withIndex()){
      val (uri,text)=pair;val row=seeds[index];val id=row.getString("id");var title="Shared text.txt";var mime="text/plain";var originalSize=-1L
      if(uri!=null){try{require(uri.scheme=="content"){"Only granted content URIs can be collected"};ctx.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE),null,null,null)?.use {if(it.moveToFirst()){title=it.getString(0) ?: "shared-input";if(!it.isNull(1))originalSize=it.getLong(1)}};mime=ctx.contentResolver.getType(uri)?.lowercase()?.takeIf {it.matches(Regex("[a-z0-9.+-]+/[a-z0-9.+-]+"))} ?: "application/octet-stream"}catch(_:Exception){}}
      title=name(title);row.put("filename",title).put("mime",mime).put("detail","")
      save(row)
      try {
        require(originalSize<=ITEM){"Input exceeds 64 MiB."};room(if(originalSize>0)originalSize+originalSize/CHUNK*48+64 else CHUNK+64L)
        val input=if(uri!=null){require(uri.scheme=="content"){"Only granted content URIs are supported"};ctx.contentResolver.openInputStream(uri) ?: error("Provider cannot supply bytes")}else ByteArrayInputStream((text ?: "").toByteArray())
        val digest=MessageDigest.getInstance("SHA-256");var total=0L;val part=File(root,"$id.part")
        FileOutputStream(part).use {file->DataOutputStream(file).use {out->input.use {stream->val buffer=ByteArray(CHUNK);while(true){val n=stream.readNBytes(buffer,0,buffer.size);if(n==0)break;require(total+n<=ITEM){"Input exceeds 64 MiB."};room(n+48L);digest.update(buffer,0,n);total+=n;val encrypted=seal(buffer.copyOf(n));out.writeInt(encrypted.size);out.write(encrypted)};out.writeInt(0);out.flush();file.fd.sync()}}}
        val target=File(root,"$id.bin");check(part.renameTo(target));syncDirectory()
        val mode=when {title.endsWith(".zip",true)->"workspaceZip";title.endsWith(".md",true)||title.endsWith(".markdown",true)->"markdown";title.endsWith(".txt",true)->"text";else->"original"}
        row.put("bytes",total).put("sha256",digest.digest().joinToString(""){"%02x".format(it)}).put("mode",mode).put("state","collected").put("detail","Collected on this device. Choose a destination before upload.");save(row);outcomes.put(JSONObject().put("id",id).put("collected",true))
      }catch(e:Exception){row.put("state","acquisitionInterrupted").put("detail",(e.message ?: "Provider access expired; select the input again.").take(240));save(row);outcomes.put(JSONObject().put("id",id).put("collected",false))}
    }
    return JSONObject().put("items",outcomes)
  }
  private fun syncDirectory(){val fd=android.system.Os.open(root.path,android.system.OsConstants.O_RDONLY,0);try{android.system.Os.fsync(fd)}finally{android.system.Os.close(fd)}}
  fun receive(intent:Intent,token:String=UUID.randomUUID().toString()) {
    if(intent.action !in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE))return
    val uris=ArrayList<Uri>();intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM,Uri::class.java)?.let {uris.addAll(it)};intent.getParcelableExtra(Intent.EXTRA_STREAM,Uri::class.java)?.let {uris.add(it)};intent.clipData?.let {for(i in 0 until it.itemCount)it.getItemAt(i).uri?.let {u->uris.add(u)}}
    val distinct=uris.distinct();val text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    worker.execute {try{acquire(token,distinct.map {it to null},text)}catch(e:Exception){acquisitionFailure(e.message ?: "Share could not be collected")} }
  }
  fun picker(intent:Intent){val uris=ArrayList<Uri>();intent.data?.let {uris.add(it)};intent.clipData?.let {for(i in 0 until it.itemCount)it.getItemAt(i).uri?.let {u->uris.add(u)}};worker.execute {try{acquire(UUID.randomUUID().toString(),uris.distinct().map {it to null},null)}catch(e:Exception){acquisitionFailure(e.message ?: "Picker input unavailable")}}}
  private fun acquisitionFailure(detail:String){synchronized(this){if(rows().size<COUNT)save(JSONObject().put("id",UUID.randomUUID().toString()).put("filename","Acquisition failed").put("state","acquisitionInterrupted").put("bytes",0).put("detail",detail.take(240)))}}
  /** Authenticate bounded chunks and verify complete original before any network dispatch. */
  fun original(row:JSONObject,consume:(ByteArray)->Unit) {val id=UUID.fromString(row.getString("id")).toString();val digest=MessageDigest.getInstance("SHA-256");var size=0L
    DataInputStream(FileInputStream(File(root,"$id.bin"))).use {input->while(true){val length=input.readInt();if(length==0){require(input.read()==-1);break};require(length in 28..CHUNK+28);val bytes=input.readNBytes(length);require(bytes.size==length);val plain=unseal(bytes);size+=plain.size;require(size<=ITEM);digest.update(plain);consume(plain)}}
    require(size==row.getLong("bytes") && digest.digest().joinToString(""){"%02x".format(it)}==row.getString("sha256")){"Stored original failed integrity verification. Retain bytes for recovery."}
  }
  @Synchronized fun confirm(id:String,source:JSONObject,mode:String,collection:String?,workspaceName:String?,metered:Boolean):JSONObject {
    val row=item(id);require(row.getString("state")=="collected"){"Only an unattempted collected input can be assigned"};require(mode in listOf("original","text","markdown","workspaceZip"));for(k in listOf("hostId","workspaceId","generation"))UUID.fromString(source.getString(k));if(collection!=null)UUID.fromString(collection)
    val intent=JSONObject().put("generation",source.getString("generation")).put("filename",row.getString("filename")).put("mime",row.getString("mime")).put("sha256",row.getString("sha256")).put("bytes",row.getLong("bytes")).put("mode",mode).put("collectionId",collection ?: JSONObject.NULL)
    if(mode=="workspaceZip"){require(!workspaceName.isNullOrBlank()&&workspaceName.length<=100);intent.remove("mime");intent.remove("mode");intent.remove("collectionId");intent.put("hostId",source.getString("hostId")).put("workspaceId",source.getString("workspaceId")).put("name",workspaceName)}
    original(row){};row.put("source",source).put("intent",intent).put("mode",mode).put("metered",metered).put("state","queued").put("detail","Queued for the confirmed source");save(row);return row
  }
  @Synchronized fun retry(id:String,metered:Boolean):JSONObject{val row=item(id);require(row.has("intent")&&!row.has("receipt")){"No pending delivery"};row.put("state",if(row.optBoolean("attempted"))"unknown" else "queued").put("nextAttemptAt",0).put("metered",metered).put("detail","Retry the same immutable operation");save(row);return row}
  @Synchronized fun rejection(id:String,code:String){require(code in listOf("IMPORT_COLLECTION_UNAVAILABLE","IMPORT_ENCODING_UNSUPPORTED","IMPORT_CONVERSION_LIMIT"));val row=item(id);row.put("rejectionCode",code);save(row)}
  @Synchronized fun newAfterRejection(id:String):JSONObject {val old=item(id);require(old.optString("rejectionCode") in listOf("IMPORT_COLLECTION_UNAVAILABLE","IMPORT_ENCODING_UNSUPPORTED","IMPORT_CONVERSION_LIMIT")&&!old.has("receipt")){"Only a definitive host refusal permits a separately confirmed new operation"};require(rows().size<COUNT);original(old){};room(File(root,"$id.bin").length());val next=UUID.randomUUID().toString();val part=File(root,"$next.part");try{File(root,"$id.bin").inputStream().use {input->FileOutputStream(part).use {out->input.copyTo(out);out.fd.sync()}};check(part.renameTo(File(root,"$next.bin")));syncDirectory();val row=JSONObject().put("id",next).put("filename",old.getString("filename")).put("mime",old.getString("mime")).put("bytes",old.getLong("bytes")).put("sha256",old.getString("sha256")).put("mode",old.getString("mode")).put("state","collected").put("previousRejectedOperation",id).put("createdAt",System.currentTimeMillis()).put("detail","New import requires explicit destination confirmation. Prior host refusal remains recorded.");save(row);return row}catch(e:Exception){part.delete();throw e}}
  @Synchronized fun stop(id:String):JSONObject{val row=item(id);require(!row.has("receipt")){"Import already acknowledged"};row.put("state",if(row.optBoolean("attempted"))"stoppedUncertain" else "cancelled").put("detail",if(row.optBoolean("attempted"))"Attempts stopped. The host may already have committed; retry this exact operation to reconcile." else "Cancelled before dispatch");save(row);return row}
  @Synchronized fun remove(id:String):JSONObject{val row=item(id);require(!row.optBoolean("attempted")||row.has("receipt")||row.has("rejectionCode")){"Reconcile uncertain delivery before removing original bytes"};require(row.getString("state")!="acquiring");for(extension in listOf("bin","part")){val file=File(root,"$id.$extension");check(!file.exists()||file.delete()){"Original could not be removed; queue retained"}};db.beginTransaction();try{db.delete("items","id=?",arrayOf(id));val acquisition=row.optString("acquisition");if(acquisition.isNotEmpty()&&rows().none {it.optString("acquisition")==acquisition})db.delete("acquisitions","id=?",arrayOf(acquisition));db.setTransactionSuccessful()}finally{db.endTransaction()};syncDirectory();changed?.invoke();return JSONObject()}
  @Synchronized fun claim(id:String):JSONObject {val row=item(id);require(row.getString("state") in listOf("queued","unknown","sending","needsAttention","waitingOwner"));row.put("state","sending").put("attempted",true).put("attempts",row.optInt("attempts")+1).put("detail","Sending to confirmed source");save(row);return row}
  @Synchronized fun outcome(id:String,state:String,detail:String,receipt:JSONObject?=null){val row=item(id);if(row.getString("state")=="stoppedUncertain"&&receipt==null)return;row.put("state",state).put("detail",detail.take(300)).put("nextAttemptAt",System.currentTimeMillis()+minOf(300000,2000L*(1L shl minOf(row.optInt("attempts"),7))));if(receipt!=null)row.put("receipt",receipt);save(row)}
  internal fun closeFixture(){require(root.canonicalPath.startsWith(ctx.cacheDir.canonicalPath+File.separator));worker.shutdownNow();helper.close()}
}
