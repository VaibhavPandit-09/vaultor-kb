package com.vaultorandroid
import com.facebook.react.bridge.BridgeReactContext
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CaptureFeedbackTraceTest {
  @Test fun ordinaryNativeBuildRejectsDiagnostics() {
    org.junit.Assume.assumeFalse(BuildConfig.VAULTOR_DIAGNOSTICS)
    val context=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
    assertEquals("com.vaultor.app",context.packageName)
    assertEquals(0,context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)
    val port=VaultorPresentation(BridgeReactContext(context))
    assertEquals(false,port.getConstants()["developmentDiagnostics"])
    fun refused(call:(com.facebook.react.bridge.PromiseImpl)->Unit) {
      val done=java.util.concurrent.CountDownLatch(1);var error="";var resolved=false
      call(com.facebook.react.bridge.PromiseImpl(com.facebook.react.bridge.Callback{resolved=true;done.countDown()},com.facebook.react.bridge.Callback{error=it[0].toString();done.countDown()}))
      assertTrue(done.await(10,java.util.concurrent.TimeUnit.SECONDS));assertFalse(resolved);assertTrue(error.contains("DEVELOPMENT_ONLY"))
    }
    for(action in listOf("arm","read","copy","clear"))refused{port.captureTrace(action,it)}
    refused{port.captureTraceRecord("test","durable_save","{}",0.0,it)}
    refused{port.feedbackTraced("complete","REVIEW_CAPTURED",0.0,"release-test","test",it)}
    port.invalidate()
  }

  @Test fun bridgeRecordsRejectionWithoutRequestingPlayback() {
    val context=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
    val port=VaultorPresentation(BridgeReactContext(context))
    fun call(run:(com.facebook.react.bridge.PromiseImpl)->Unit):String {
      val done=java.util.concurrent.CountDownLatch(1);var value="";var failed=false
      run(com.facebook.react.bridge.PromiseImpl(com.facebook.react.bridge.Callback{value=it[0]?.toString()?:"";done.countDown()},com.facebook.react.bridge.Callback{failed=true;done.countDown()}))
      assertTrue(done.await(10,java.util.concurrent.TimeUnit.SECONDS));assertFalse(failed);return value
    }
    val id=JSONObject(call{port.captureTrace("arm",it)}).getString("id")
    call{port.feedbackTraced("complete","REVIEW_CAPTURED",0.0,"",id,it)}
    call{port.feedbackTraced("complete","REVIEW_CAPTURED",0.0,"same",id,it)}
    call{port.feedbackTraced("complete","REVIEW_CAPTURED",0.0,"same",id,it)}
    val rows=JSONObject(call{port.captureTrace("read",it)}).getJSONArray("records")
    val records=(0 until rows.length()).map{rows.getJSONObject(it)}
    assertTrue(records.any{it.optString("reason")=="invalid_token"})
    assertTrue(records.any{it.optString("reason")=="duplicate_token"})
    assertTrue(records.any{it.optString("stage")=="native_result" && it.optString("status")=="suppressed"})
    assertFalse(records.any{it.getString("stage")=="platform_request"})
    call{port.captureTrace("copy",it)}
    port.invalidate()
  }
  @Test fun boundedSanitizedSealedAndIsolated() {
    val trace=CaptureFeedbackTrace(true)
    val id=JSONObject(trace.arm()).getString("id")
    val secret="PRIVATE_FIXTURE"
    val facts=JSONObject().put("comment",secret).put("resourceId",secret).put("reason",secret)
      .put("route",secret).put("keyboardVisible",true).put("event","complete")
    trace.record("foreign","durable_save",facts)
    trace.record(id,secret,facts)
    repeat(140){trace.record(id,"completion_check",facts,1.0)}
    var snapshot=JSONObject(trace.snapshot())
    assertEquals(128,snapshot.getJSONArray("records").length());assertEquals(12,snapshot.getInt("dropped"))
    assertFalse(snapshot.toString().contains(secret))
    assertTrue(snapshot.getJSONArray("records").getJSONObject(0).getBoolean("keyboardVisible"))
    val sealed=trace.seal();trace.record(id,"js_emit");assertEquals(sealed,trace.snapshot())
    val next=JSONObject(trace.arm());assertNotEquals(id,next.getString("id"))
    trace.record(id,"js_emit");assertEquals(0,JSONObject(trace.snapshot()).getJSONArray("records").length())
    assertEquals("",JSONObject(trace.clear()).getString("id"))
  }
  @Test fun ordinaryGateCannotCollect() {
    val trace=CaptureFeedbackTrace(false)
    trace.record("test","durable_save")
    assertFalse(trace.measuring)
    try{trace.arm();fail("ordinary build must reject arm")}catch(_:IllegalStateException){}
    try{trace.snapshot();fail("ordinary build must reject read")}catch(_:IllegalStateException){}
  }
}
