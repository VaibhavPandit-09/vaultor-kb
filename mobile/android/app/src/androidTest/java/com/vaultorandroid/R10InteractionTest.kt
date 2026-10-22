package com.vaultorandroid

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One focused R10 layout/theme/reduced-motion audit; no subjective phone certification. */
@RunWith(AndroidJUnit4::class)
class R10InteractionTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val d get()=UiDevice.getInstance(i)
  private fun web():WebView {var result:WebView?=null;i.runOnMainSync{fun visit(v:View){if(v is WebView)result=v;if(v is ViewGroup)for(n in 0 until v.childCount)visit(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::visit)};return result?:error("Reader not mounted")}
  private fun js(code:String):String {val latch=CountDownLatch(1);var result="";val w=web();i.runOnMainSync{w.evaluateJavascript(code){result=it;latch.countDown()}};assertTrue(latch.await(10,TimeUnit.SECONDS));return result}
  private fun waitJs(code:String){repeat(100){if(runCatching{js(code)=="true"}.getOrDefault(false))return;Thread.sleep(100)};fail(code)}
  private fun launch(){val ctx=i.targetContext;ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),30000));waitJs("!!document.querySelector('article p')")}
  private fun tap(label:String){var node=d.wait(Until.findObject(By.desc(label).enabled(true)),3000);for(direction in listOf(Direction.DOWN,Direction.UP))if(node==null)node=d.findObject(By.scrollable(true))?.scrollUntil(direction,Until.findObject(By.desc(label).enabled(true)));assertNotNull(label,node);node!!.click();Thread.sleep(350)}
  private fun frame(name:String){d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r10-audit-$name.png"));d.dumpWindowHierarchy(File(i.targetContext.getExternalFilesDir(null),"r10-audit-$name.xml"))}
  private fun preferences(action:String,input:String):String {val latch=CountDownLatch(1);var value="";var refused=false;VaultorModule(BridgeReactContext(i.targetContext)).readerPreferences(action,input,PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{refused=true;latch.countDown()}));assertTrue(latch.await(10,TimeUnit.SECONDS));assertFalse(refused);return value}
  @Test fun longReaderThemesFontLandscapeNarrowAndReducedMotion(){
    val font=d.executeShellCommand("settings get system font_scale").trim()
    val motion=d.executeShellCommand("settings get global transition_animation_scale").trim()
    val size=d.executeShellCommand("wm size")
    val savedPreferences=preferences("get","{}")
    try {
      launch();waitJs("!!document.querySelector('table')&&!!document.querySelector('pre')&&document.querySelectorAll('img').length>=3")
      waitJs("document.documentElement.scrollWidth<=innerWidth+1")
      val retained=web();js("window.__r10Paragraph=document.querySelector('article p');true")
      tap("Reading appearance");tap("More reading settings");tap("OLED");tap("Done")
      waitJs("document.documentElement.dataset.theme==='oled'");assertSame(retained,web());waitJs("window.__r10Paragraph===document.querySelector('article p')");frame("oled")
      tap("Reading appearance");tap("More reading settings");tap("Dark");tap("Done")
      waitJs("document.documentElement.dataset.theme==='dark'");assertSame(retained,web());frame("dark")
      tap("Reading appearance");tap("More reading settings");tap("Light");tap("Done")
      waitJs("document.documentElement.dataset.theme==='light'");assertSame(retained,web())
      d.executeShellCommand("settings put global transition_animation_scale 0")
      waitJs("document.documentElement.dataset.motion==='snappy'")
      d.executeShellCommand("settings put system font_scale 1.3");Thread.sleep(1200);launch()
      waitJs("document.documentElement.scrollWidth<=innerWidth+1");frame("font130")
      d.setOrientationLeft();Thread.sleep(1000);waitJs("innerWidth>innerHeight&&document.documentElement.scrollWidth<=innerWidth+1");frame("landscape")
      d.setOrientationNatural();Thread.sleep(700)
      // Short narrow viewport only; this does not claim an Android split-screen task.
      d.executeShellCommand("wm size 720x1000");Thread.sleep(1000);launch();waitJs("document.documentElement.scrollWidth<=innerWidth+1");frame("narrow-short")
      tap("Reading options");assertTrue(d.wait(Until.hasObject(By.desc("Find within note")),5000));d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),5000))
    } finally {
      d.setOrientationNatural()
      val override=Regex("Override size: (\\d+x\\d+)").find(size)?.groupValues?.get(1)
      d.executeShellCommand(if(override==null)"wm size reset" else "wm size $override")
      d.executeShellCommand(if(font=="null")"settings delete system font_scale" else "settings put system font_scale $font")
      d.executeShellCommand(if(motion=="null")"settings delete global transition_animation_scale" else "settings put global transition_animation_scale $motion")
      preferences("put",savedPreferences)
    }
  }
}
