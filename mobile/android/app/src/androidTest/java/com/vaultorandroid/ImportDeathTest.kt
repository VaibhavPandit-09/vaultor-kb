package com.vaultorandroid
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.core.content.FileProvider
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File
import java.util.UUID
@RunWith(AndroidJUnit4::class)
class ImportDeathTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
 private val meta get()=File(ctx.cacheDir,"r7-acquisition-death.json")
 @Test fun dieDuringActualPrivateCopy(){
  val root=File(ctx.cacheDir,"import-death-"+UUID.randomUUID());val store=VaultorImports.fixture(ctx,root);val share=File(ctx.cacheDir,"media-share").apply {mkdirs()};val source=File(share,"death-"+UUID.randomUUID()+".bin");java.io.RandomAccessFile(source,"rw").use {it.setLength(64L*1024*1024)};val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",source);meta.writeText(JSONObject().put("root",root.path).put("source",source.path).toString());store.worker.execute {store.acquire(UUID.randomUUID().toString(),listOf(uri to null),null)}
  repeat(2000){if(root.listFiles()?.any {it.name.endsWith(".part")&&it.length()>262144}==true){android.os.Process.killProcess(android.os.Process.myPid());Thread.sleep(10000)};Thread.sleep(2)};fail("Did not reach active staging death checkpoint")
 }
 @Test fun recoverAfterActualAcquisitionDeath(){val a=JSONObject(meta.readText());val root=File(a.getString("root"));require(root.canonicalPath.startsWith(ctx.cacheDir.canonicalPath+File.separator));val store=VaultorImports.fixture(ctx,root);try{val row=store.rows().single();assertEquals("acquisitionInterrupted",row.getString("state"));assertFalse(row.has("sha256"));assertFalse(row.has("source"));assertFalse(row.optBoolean("attempted"));assertTrue(root.listFiles()!!.any {it.name.endsWith(".part")&&it.length()>0});store.remove(row.getString("id"));assertTrue(store.rows().isEmpty())}finally{store.closeFixture();root.deleteRecursively();File(a.getString("source")).delete()}}
 @Test fun dieAfterDurableSendingClaim(){val root=File(ctx.cacheDir,"import-claim-death-"+UUID.randomUUID());val store=VaultorImports.fixture(ctx,root);store.acquire(UUID.randomUUID().toString(),emptyList(),"Durable exact original across process death");val row=store.rows().single();val source=JSONObject().put("hostId",UUID.randomUUID().toString()).put("workspaceId",UUID.randomUUID().toString()).put("generation",UUID.randomUUID().toString());store.confirm(row.getString("id"),source,"text",null,null,false);val claimed=store.claim(row.getString("id"));File(ctx.cacheDir,"r7-claim-death.json").writeText(JSONObject().put("root",root.path).put("row",claimed).toString());android.os.Process.killProcess(android.os.Process.myPid());Thread.sleep(10000);fail("Intentional sending-claim death")}
 @Test fun recoverAfterActualClaimDeath(){val saved=JSONObject(File(ctx.cacheDir,"r7-claim-death.json").readText());val root=File(saved.getString("root"));require(root.canonicalPath.startsWith(ctx.cacheDir.canonicalPath+File.separator));val store=VaultorImports.fixture(ctx,root);try{val row=store.rows().single();assertEquals("sending",row.getString("state"));assertEquals(saved.getJSONObject("row").getJSONObject("intent").toString(),row.getJSONObject("intent").toString());store.original(row){};try{store.remove(row.getString("id"));fail("Uncertain input must remain")}catch(_:IllegalArgumentException){}}finally{store.closeFixture();root.deleteRecursively()}}
}
