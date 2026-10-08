package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import com.facebook.react.bridge.BridgeReactContext
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StorageTest {
  @Test fun migratesA1ProtectedDraftWithoutChangingItsContent() {
    val context=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext)
    val module=VaultorModule(context);val file=File(context.noBackupFilesDir,"vaultor-state.bin")
    val original=if(file.exists())file.readBytes() else null
    try {
      val id="00000000-0000-4000-8000-000000000003"
      val legacy=JSONObject().put("scope","migration-fixture").put("noteId",id).put("version","legacy-1").put("revision","r1").put("content",JSONObject().put("type","doc"))
      val write=VaultorModule::class.java.getDeclaredMethod("write",JSONObject::class.java).apply {isAccessible=true}
      write.invoke(module,JSONObject().put("draft",legacy))
      val actual=JSONObject(result {module.storage("getDraft",JSONObject().put("scope","migration-fixture").put("noteId",id).toString(),it)})
      assertEquals("legacy-1",actual.getString("version"));assertEquals("r1",actual.getString("revision"))
      assertEquals(legacy.getJSONObject("content").toString(),actual.getJSONObject("content").toString())
      assertEquals("Recovered note",actual.getString("title"))
    } finally {if(original!=null)file.writeBytes(original) else file.delete()}
  }
  @Test fun rejectsPublicAndUnboundedOrigins() {
    val context=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext)
    val module=VaultorModule(context)
    val method=VaultorModule::class.java.getDeclaredMethod("address",String::class.java).apply {isAccessible=true}
    assertEquals("https://192.168.1.20:8443",method.invoke(module,"https://192.168.1.20:8443"))
    for(value in listOf("http://192.168.1.20:8443","https://8.8.8.8","https://example.com","https://192.168.1.20/path","https://user:secret@192.168.1.20","https://192.168.1.20?token=secret")) {
      try {method.invoke(module,value);fail("Unsafe origin accepted")}
      catch(e:java.lang.reflect.InvocationTargetException) {assertTrue(e.cause is IllegalArgumentException)}
    }
  }
  private fun result(action: (PromiseImpl) -> Unit): String {
    val latch=CountDownLatch(1)
    var result: String?=null
    var failed=false
    action(PromiseImpl(Callback { args -> result=args[0]?.toString();latch.countDown() },Callback { _ -> failed=true;latch.countDown() }))
    assertTrue("Native operation timed out",latch.await(20,TimeUnit.SECONDS))
    assertFalse("Native operation rejected",failed)
    return result ?: "null"
  }
  @Test fun encryptedDraftAndExactAcknowledgement() {
    val context=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext)
    val module=VaultorModule(context)
    val file=File(context.noBackupFilesDir,"vaultor-state.bin")
    val original=if(file.exists())file.readBytes() else null
    try {
      val doc=JSONObject().put("scope","isolated-fixture").put("noteId","test").put("version","edit-1").put("content","secret-fixture-only")
      result { module.journal(doc.toString(),it) }
      assertFalse(file.readBytes().toString(Charsets.UTF_8).contains("secret-fixture-only"))
      result { module.acknowledge("older-edit",it) }
      assertEquals("edit-1",JSONObject(result { module.draft(it) }).getString("version"))
      result { module.acknowledge("edit-1",it) }
      assertEquals("null",result { module.draft(it) })
    } finally {
      if(original!=null)file.writeBytes(original) else file.delete()
    }
  }
  @Test fun scopedDraftsSessionsAndExactAcknowledgement() {
    val context=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext)
    val module=VaultorModule(context);val file=File(context.noBackupFilesDir,"vaultor-state.bin")
    val original=if(file.exists())file.readBytes() else null
    val id="00000000-0000-4000-8000-000000000002"
    try {
      val scope="[\"fixture-a\",\"workspace\",\"g1\"]"
      val second="[\"fixture-b\",\"workspace\",\"g1\"]"
      val draft=JSONObject().put("scope",scope).put("noteId",id).put("version","fixture-1").put("revision","r1").put("title","Fixture").put("content",JSONObject().put("type","doc"))
      result {module.storage("putDraft",draft.toString(),it)}
      result {module.storage("putDraft",JSONObject(draft.toString()).put("scope",second).put("version","fixture-2").toString(),it)}
      val lookup=JSONObject().put("scope",scope).put("noteId",id)
      result {module.storage("ackDraft",JSONObject(lookup.toString()).put("version","older").toString(),it)}
      assertEquals("fixture-1",JSONObject(result {module.storage("getDraft",lookup.toString(),it)}).getString("version"))
      result {module.storage("keepSaved",JSONObject(lookup.toString()).put("version","fixture-1").toString(),it)}
      assertEquals("null",result {module.storage("getDraft",lookup.toString(),it)})
      val archived=JSONObject(lookup.toString()).put("version","fixture-1").put("recoveryKey",scope+"\n"+id+"\nfixture-1")
      assertTrue(JSONObject(result {module.storage("getDraft",archived.toString(),it)}).getBoolean("resolved"))
      result {module.storage("putDraft",JSONObject(draft.toString()).put("version","fixture-new").toString(),it)}
      assertEquals("fixture-1",JSONObject(result {module.storage("getDraft",archived.toString(),it)}).getString("version"))
      result {module.storage("ackDraft",archived.toString(),it)}
      result {module.storage("ackDraft",JSONObject(lookup.toString()).put("version","fixture-1").toString(),it)}
      assertEquals("fixture-new",JSONObject(result {module.storage("getDraft",lookup.toString(),it)}).getString("version"))
      assertEquals("fixture-2",JSONObject(result {module.storage("getDraft",JSONObject(lookup.toString()).put("scope",second).toString(),it)}).getString("version"))
      result {module.storage("putSession",JSONObject().put("scope",scope).put("hostId","fixture-a").put("noteId",id).put("position",JSONObject().put("scroll",90)).toString(),it)}
      assertEquals(90,JSONObject(result {module.storage("getSession",JSONObject().put("scope",scope).toString(),it)}).getJSONObject("position").getInt("scroll"))
      val bootstrap=JSONObject(result {module.storage("bootstrap","{}",it)})
      assertFalse(bootstrap.toString().contains("credential"));assertFalse(bootstrap.toString().contains("ca\":"))
      assertFalse(file.readBytes().toString(Charsets.UTF_8).contains("fixture-2"))
    } finally {if(original!=null)file.writeBytes(original) else file.delete()}
  }
}
