package com.vaultorandroid

import android.content.Context
import android.content.ContextWrapper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.MessageDigest
import java.security.cert.Certificate
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/** Deterministic transport failures around the real SQLite/file store, in a
 * disposable app-private root. Real pinned HTTPS is checked separately. */
@RunWith(AndroidJUnit4::class)
class CompanionStoreTest {
  private val base=InstrumentationRegistry.getInstrumentation().targetContext
  private fun uuid()=UUID.randomUUID().toString()
  private fun digest(b:ByteArray)=MessageDigest.getInstance("SHA-256").digest(b).joinToString(""){"%02x".format(it)}
  internal inner class Fixture(val count:Int=3,rootOverride:File?=null,hostOverride:String?=null,workspaceOverride:String?=null) {
    val root=rootOverride ?: File(base.noBackupFilesDir,"r4-test-${uuid()}").apply {mkdirs()}
    val context=object:ContextWrapper(base) {
      override fun getNoBackupFilesDir()=root
      override fun getSharedPreferences(name:String,mode:Int)=base.getSharedPreferences(root.name+name,mode)
    }
    val host=hostOverride?:uuid();val workspace=workspaceOverride?:uuid();val generation=uuid();val scope=JSONArray(listOf(host,workspace,generation)).toString()
    var note=uuid();val image=uuid();val collection=uuid();val binary=ByteArray(2*1024*1024){(it%251).toByte()}
    var text="needle saved-only";var corrupt=false;var oversized=false;var revoked=false;var replacement=false;var interrupt=false;var slow=false
    @Volatile var identityHook:(()->Unit)?=null
    val ranges=mutableListOf<Long>();val snapshots=mutableMapOf<String,Pair<JSONObject,Map<String,ByteArray>>>()
    val args=JSONObject().put("hostId",host).put("epoch","test").put("scope",scope).put("name","Offline test").put("selection",JSONObject().put("scope","workspace").put("ids",JSONArray()).put("dependencies","linked").put("files","readable"))
    fun store()=VaultorCompanions(context,{_,path,method->Connection(path,method)},{})
    fun create(id:String):Pair<JSONObject,Map<String,ByteArray>> {
      val document=JSONObject().put("type","doc").put("content",JSONArray().put(JSONObject().put("type","paragraph").put("content",JSONArray().put(JSONObject().put("type","text").put("text",text))))).toString().toByteArray()
      fun descriptor(key:String,b:ByteArray)=JSONObject().put("key",key).put("bytes",b.size).put("sha256",digest(b)).put("state","available")
      val entries=JSONArray();for(i in 0 until count){val n=if(i==0)note else if(i==1)image else UUID.nameUUIDFromBytes("row$i".toByteArray()).toString();val isFile=i==1
        entries.put(JSONObject().put("id",n).put("type",if(isFile)"file" else "note").put("title",if(i==0)"Alpha title" else if(isFile)"Beta file" else "Note $i").put("revision","r1").put("mimeType",if(isFile)"text/plain" else JSONObject.NULL).put("favorite",i<2).put("updatedAt","2026-10-14T10:00:00Z").put("lastOpenedAt",if(i%2==0)"2026-10-14T11:00:00Z"else JSONObject.NULL).put("collections",JSONArray().put(JSONObject().put("id",collection).put("name","Collection"))).put("tags",JSONArray()).put("state","available").put(if(isFile)"binary"else"document",descriptor("$n.${if(isFile)"bin" else "json"}",if(isFile)binary else document).also {if(isFile && oversized)it.put("bytes",67108864L)}))
      }
      val org=JSONObject().put("collections",JSONArray().put(JSONObject().put("id",collection).put("name","Collection").put("favorite",true).put("resources",JSONArray((0 until entries.length()).map {entries.getJSONObject(it).getString("id")})))).put("tags",JSONArray()).toString().toByteArray()
      val manifest=JSONObject().put("version",1).put("id",id).put("workspaceId",workspace).put("generation",generation).put("resources",entries).put("organization",descriptor("organization.json",org)).toString().toByteArray()
      val payloads=mutableMapOf("manifest.json" to manifest,"organization.json" to org,"$image.bin" to binary)
      for(i in 0 until entries.length()){val e=entries.getJSONObject(i);if(e.getString("type")=="note")payloads[e.getString("id")+".json"]=document}
      return JSONObject().put("manifestSha256",digest(manifest)).put("resources",entries.length()).put("status","READY").put("generation",generation).put("entries",entries).put("organization",descriptor("organization.json",org)) to payloads
    }
    inner class Connection(private val path:String,method:String):HttpsURLConnection(URL("https://127.0.0.1$path")) {
      init{requestMethod=method}
      override fun connect(){};override fun disconnect(){};override fun usingProxy()=false
      override fun getCipherSuite()="TEST";override fun getLocalCertificates():Array<Certificate>?=null;override fun getServerCertificates():Array<Certificate> = emptyArray()
      override fun getOutputStream()=ByteArrayOutputStream()
      private fun snapshot():Pair<JSONObject,Map<String,ByteArray>> {val id=path.substringAfter("/companions/").substringBefore('/').substringBefore('?');return snapshots.getOrPut(id){create(id)}}
      private fun body():ByteArray {
        val value=when {
          path=="/capabilities"->JSONObject().put("companionSnapshots",1)
          path=="/workspace/identity"->JSONObject().put("id",workspace).put("generation",if(replacement)"changed"else generation)
          path=="/companions/estimate"->JSONObject().put("resources",count).put("bytes",binary.size)
          path.contains("/payloads/")->return snapshot().second[path.substringAfter("/payloads/")]!!
          path.contains("/inventory")-> {val snap=snapshot().first;val page=path.substringAfter("page=").substringBefore('&').toInt();JSONObject().put("items",JSONArray((page*25 until minOf(count,page*25+25)).map {snap.getJSONArray("entries").getJSONObject(it)})).put("totalItems",count).put("totalPages",(count+24)/25).put("manifestSha256",snap.getString("manifestSha256")).put("generation",generation).put("organization",snap.getJSONObject("organization"))}
          path.contains("/coverage")->JSONObject().put("items",JSONArray()).put("totalPages",0)
          else->snapshot().first
        };return value.toString().toByteArray()
      }
      override fun getResponseCode():Int=if(revoked)403 else if(getRequestProperty("Range")!=null)206 else 200
      override fun getContentLengthLong()=body().size.toLong()
      override fun getHeaderField(name:String?):String? {val b=body();return when(name){"X-Vaultor-SHA256"->digest(b);"Content-Range"->"bytes ${getRequestProperty("Range").substringAfter("=").substringBefore('-')}-${b.size-1}/${b.size}";else->null}}
      override fun getErrorStream()=ByteArrayInputStream("{\"code\":\"WORKSPACE_ACCESS_REVOKED\"}".toByteArray())
      override fun getInputStream():java.io.InputStream {
        if(path=="/workspace/identity")identityHook?.invoke()
        val all=body();val offset=getRequestProperty("Range")?.substringAfter('=')?.substringBefore('-')?.toLong() ?: 0L
        if(offset>0)synchronized(ranges){ranges.add(offset)}
        val data=all.copyOfRange(offset.toInt(),all.size)
        if(corrupt && path.endsWith("$note.json") && data.isNotEmpty())data[0]=(data[0].toInt() xor 1).toByte()
        val stream=ByteArrayInputStream(data)
        return object:java.io.FilterInputStream(stream){var read=0;override fun read(b:ByteArray,off:Int,len:Int):Int{if(slow && path.endsWith(".bin"))Thread.sleep(8);if(interrupt && path.endsWith(".bin") && read>524288)throw java.io.IOException("Interrupted fixture stream");val n=super.read(b,off,minOf(len,65536));if(n>0)read+=n;return n}}
      }
    }
    fun await(store:VaultorCompanions,id:String):JSONObject {repeat(2000){val rows=store.list();val row=(0 until rows.length()).map {rows.getJSONObject(it)}.first {it.getString("id")==id};if(row.getString("status")!="downloading" && !row.optBoolean("workerActive"))return row;Thread.sleep(20)};error("Download timeout")}
    fun download(store:VaultorCompanions):JSONObject {val id=store.start(args).getString("id");return await(store,id)}
  }
  @Test fun pagingSearchPinsAndColdStore() {
    val f=Fixture(301);val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
    val result=f.download(store);assertEquals(result.optString("detail"),"ready",result.getString("status"));assertEquals("301",result.getString("done"))
    assertEquals(301,store.query(f.scope,"/resources?page=0&size=100").getInt("totalItems"));assertEquals(1,store.query(f.scope,"/resources?page=3&size=100").getJSONArray("items").length())
    assertEquals(0,store.query(f.scope,"/resources?q=needle").getInt("totalItems"));assertEquals(300,store.query(f.scope,"/resources/query?q=needle").getInt("totalItems"))
    assertEquals(3,store.query(f.scope,"/organization/pins").getInt("totalItems"));assertEquals(1,store.query(f.scope,"/organization/pins?kind=collection").getInt("totalItems"))
    assertEquals(0,store.query(f.scope,"/resources?collection=${UUID.randomUUID()}").getInt("totalItems"))
    assertEquals("needle saved-only",store.query(f.scope,"/resources/${f.note}").getJSONObject("content").getJSONArray("content").getJSONObject(0).getJSONArray("content").getJSONObject(0).getString("text"))
    val restarted=f.store();assertEquals(f.scope,restarted.available(f.host,f.workspace)!!.getString("scope"));assertEquals(digest(f.binary),digest(restarted.file(f.scope,f.image)!!.readBytes()))
  }
  @Test fun failedRefreshBudgetHashesAndReplacementPreservePrior() {
    val f=Fixture();val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",64))
    val good=f.download(store);assertEquals("ready",good.getString("status"));f.text="new content";f.corrupt=true
    val bad=f.download(store);assertEquals("paused",bad.getString("status"));assertTrue(bad.getString("detail").contains("verification"));assertEquals(good.getString("id"),store.available(f.host,f.workspace)!!.getString("active"))
    store.remove(bad.getString("id"));f.corrupt=false;f.oversized=true
    val full=f.download(store);assertEquals("paused",full.getString("status"));assertTrue(full.getString("detail").contains("storage"));assertEquals(good.getString("id"),store.available(f.host,f.workspace)!!.getString("active"))
    store.remove(full.getString("id"));f.oversized=false;f.replacement=true
    assertEquals("paused",f.download(store).getString("status"));assertNull(store.available(f.host,f.workspace));assertTrue(File(f.root,"companions-v1/${good.getString("id")}/${f.note}.json").exists())
  }
  @Test fun interruptedBytesResumeAndAccessLocks() {
    val f=Fixture();val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",64));f.interrupt=true
    val partial=f.download(store);assertEquals("paused",partial.getString("status"));assertNull(store.available(f.host,f.workspace));assertTrue(File(f.root,"companions-v1/${partial.getString("id")}/${f.image}.bin.part").length()>0)
    f.interrupt=false;val resumed=f.download(store);assertEquals(partial.getString("id"),resumed.getString("id"));assertEquals("ready",resumed.getString("status"));assertTrue(f.ranges.any {it>0});assertEquals(digest(f.binary),digest(store.file(f.scope,f.image)!!.readBytes()))
    f.revoked=true;assertEquals("paused",f.download(store).getString("status"));assertNull(store.available(f.host,f.workspace));try {store.query(f.scope,"/resources");fail("Revoked source opened")}catch(_:IllegalStateException){}
    assertTrue(File(f.root,"companions-v1/${resumed.getString("id")}/${f.image}.bin").exists())
    val failed=store.list();for(i in 0 until failed.length()){val j=failed.getJSONObject(i);store.remove(j.getString("id"))};assertNotNull("Removing bytes must not forget verified revocation",store.blocked(f.host,f.workspace));assertNull(store.available(f.host,f.workspace))
  }
  @Test fun separateSourcesAndSingleDownloadOwner() {
    val first=Fixture();val a=first.store();a.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128));first.slow=true
    val id=a.start(first.args).getString("id");val another=Fixture(rootOverride=first.root);another.note=first.note;another.text="second source only";val b=another.store()
    try {b.start(another.args);fail("A second queue owner started")}catch(_:IllegalStateException){}
    assertEquals("ready",first.await(a,id).getString("status"));assertEquals("ready",another.download(b).getString("status"))
    assertEquals(1,a.query(first.scope,"/resources/query?q=needle&type=note").getJSONArray("items").length().coerceAtMost(1))
    assertEquals(0,b.query(another.scope,"/resources/query?q=needle&type=note").getInt("totalItems"));assertTrue(b.query(another.scope,"/resources/query?q=second&type=note").getInt("totalItems")>0)
    assertEquals(id,a.available(first.host,first.workspace)!!.getString("active"));a.remove(id);assertNull(a.available(first.host,first.workspace));assertNotNull(b.file(another.scope,another.image))
  }}
