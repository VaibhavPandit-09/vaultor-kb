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
}
