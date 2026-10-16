package com.vaultorandroid
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FeedbackDiagnosticTest {
  init{require(android.os.Build.HARDWARE=="ranchu")}
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val d get()=UiDevice.getInstance(i)
  private fun result(call:(PromiseImpl)->Unit):Pair<String,Boolean>{val done=CountDownLatch(1);var raw="";var failed=false;call(PromiseImpl(Callback{raw=it[0].toString();done.countDown()},Callback{failed=true;done.countDown()}));assertTrue(done.await(10,TimeUnit.SECONDS));return raw to failed}
  private fun tap(label:String){var node=d.wait(Until.findObject(By.desc(label)),5000);if(node==null)node=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label)));assertNotNull(label,node);node!!.click();Thread.sleep(300)}
  @Test fun developmentGateAndSemanticProbes(){
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage(i.targetContext.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Open navigation")),10000));tap("Open navigation");tap("Appearance & reading")
    val ctx=(i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
    val module=ctx.getNativeModule("VaultorPresentation") as VaultorPresentation
    assertEquals(BuildConfig.VAULTOR_DIAGNOSTICS,module.constants["developmentDiagnostics"])
    if(!BuildConfig.VAULTOR_DIAGNOSTICS){assertTrue(result{module.hapticDiagnostics("micro","","inspect",0.0,it)}.second);assertFalse(d.hasObject(By.desc("Developer haptic diagnostics")));tap("Done");return}
    tap("Developer haptic diagnostics");tap("Trigger H1 Micro confirmation")
    assertTrue(d.wait(Until.hasObject(By.textContains("Result:")),5000))
    var tag=0;i.runOnMainSync{fun find(v:View){if(v.contentDescription?.toString()=="Trigger H1 Micro confirmation")tag=v.id;if(v is ViewGroup)for(n in 0 until v.childCount)find(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::find)};assertTrue(tag>0)
    val native=VaultorModule(ctx);val original=result{native.readerPreferences("get","{}",it)}.first;val enabled=JSONObject(original).put("haptics","system").put("richHaptics","clear")
    val system=d.executeShellCommand("settings get system haptic_feedback_enabled").trim()
    fun probe(event:String,rich:String,mode:String):JSONObject{val response=result{module.hapticDiagnostics(event,rich,mode,tag.toDouble(),it)};assertFalse(response.second);return JSONObject(response.first)}
    try{
      result{native.readerPreferences("put",enabled.toString(),it)};d.executeShellCommand("settings put system haptic_feedback_enabled 1")
      for(event in VaultorHaptics.events){val report=probe(event,"","system");assertTrue(report.toString(),report.getString("status") in setOf("requested","rejected"));assertTrue(report.has("mechanism"));assertEquals(1,report.getInt("systemSetting"))}
      for(rich in listOf("anchor","capture"))for(mode in listOf("auto","system","primitives","predefined","envelope","legacy")){val report=probe(if(rich=="anchor")"selection" else "complete",rich,mode);assertTrue(report.toString(),report.getString("status") in setOf("requested","rejected"));assertTrue(report.has("fallback"))}
      result{native.readerPreferences("put",JSONObject(enabled.toString()).put("haptics","off").toString(),it)};assertEquals("application haptics off",probe("complete","capture","auto").getString("reason"))
      result{native.readerPreferences("put",enabled.toString(),it)};d.executeShellCommand("settings put system haptic_feedback_enabled 0");assertEquals("Android touch haptics off",probe("selection","anchor","auto").getString("reason"))
    }finally{result{native.readerPreferences("put",original,it)};if(system=="null")d.executeShellCommand("settings delete system haptic_feedback_enabled")else d.executeShellCommand("settings put system haptic_feedback_enabled $system")}
    tap("Done")
  }
}
