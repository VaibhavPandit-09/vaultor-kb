package com.vaultorandroid

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.view.inspector.WindowInspector
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** UI touches against retained disposable emulator data; never pairs a phone. */
@RunWith(AndroidJUnit4::class)
class NavigationExperienceTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val d get() = UiDevice.getInstance(i)
  private fun tap(label: String) {
    val n = d.wait(Until.findObject(By.desc(label).enabled(true)), 10000)
    assertNotNull("Missing $label", n); n!!.click(); Thread.sleep(450)
  }
  private fun web(): WebView {
    var result: WebView? = null
    i.runOnMainSync {
      fun visit(v: View) { if(v is WebView) result=v; if(v is ViewGroup) for(n in 0 until v.childCount) visit(v.getChildAt(n)) }
      WindowInspector.getGlobalWindowViews().forEach(::visit)
    }
    return result ?: error("Reader missing")
  }
  private fun js(w: WebView, code: String): String {
    val latch=CountDownLatch(1); var result=""
    i.runOnMainSync { w.evaluateJavascript(code) { result=it; latch.countDown() } }
    assertTrue(latch.await(5, TimeUnit.SECONDS)); return result
  }
  private fun call(action: String): String {
    val latch=CountDownLatch(1); var value=""; var failed=false
    val m=VaultorModule(BridgeReactContext(i.targetContext))
    val p=PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()})
    if(action=="list") m.reviewCapture("list","{}",p) else m.storage("bootstrap","{}",p)
    assertTrue(latch.await(10,TimeUnit.SECONDS)); assertFalse(failed); return value
  }
  private fun frame(name: String) { d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null), "p1-$name.png")) }
  @Test fun folioReviewSourceAndReaderContinuity() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000))
    assertFalse(d.hasObject(By.desc("Open navigation")))
    if(d.hasObject(By.desc("Browse navigation"))) tap("Browse navigation")
    tap("Home"); frame("home")
    tap("Library")
    val input=d.wait(Until.findObject(By.desc("Search resources")),10000)
    input.click(); input.text="R2 Rich reading"; Thread.sleep(800)
    assertEquals("Query must be accepted before opening", "R2 Rich reading", d.findObject(By.desc("Search resources")).text)
    if(d.hasObject(By.pkg("com.google.android.inputmethod.latin"))) d.pressBack()
    tap("R2 Rich reading, Note")
    assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),10000)); Thread.sleep(1000)
    val retained=web()
    js(retained,"window.__prototypeIdentity='retained';window.scrollTo(0,300);true")
    Thread.sleep(300)
    val scroll=js(retained,"window.scrollY")
    val focused=d.findObject(By.descContains("Choose source")).visibleBounds.width()
    frame("reader")
    tap("Browse navigation")
    val expanded=d.findObject(By.descContains("Choose source")).visibleBounds.width()
    assertTrue("Context must physically expand in reading: $focused / $expanded",focused>expanded)
    frame("disclosed")
    // Reverse an in-flight transition, then settle without replacing the reader.
    val toggle=d.findObject(By.desc("Focus reading")).visibleCenter
    // Reuse screen geometry: accessibility lookup would wait for UI idle and
    // accidentally turn the second touch into a completed-transition test.
    d.click(toggle.x,toggle.y); Thread.sleep(60)
    d.click(toggle.x,toggle.y); Thread.sleep(450)
    assertTrue(d.hasObject(By.desc("Focus reading")))
    assertSame(retained,web())
    d.pressBack(); Thread.sleep(450)
    assertTrue("Back first contracts disclosed navigation",d.hasObject(By.desc("Browse navigation")))
    assertSame(retained,web()); tap("Browse navigation")
    val source=JSONObject(call("bootstrap"))
    val records=call("list")
    tap("Review")
    assertTrue(d.wait(Until.hasObject(By.text("Protected on this phone · all sources")),5000))
    assertSame(retained,web()); frame("review")
    val after=JSONObject(call("bootstrap"))
    assertEquals(source.getString("selected"),after.getString("selected"))
    assertEquals(source.getString("epoch"),after.getString("epoch"))
    val list=JSONArray(records)
    if(list.length()>0) {
      val item=list.getJSONObject(0)
      val label=item.getJSONObject("source").getString("targetTitle")+". "+if(item.getString("state")=="queued")"Queued locally" else "Protected draft"
      var row=d.findObject(By.desc(label))
      if(row==null)row=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label)))
      assertNotNull(row); row!!.click()
      assertTrue(d.wait(Until.hasObject(By.text("Review capture")),5000)); tap("Done")
      assertEquals("Opening protected records must not mutate the journal",records,call("list"))
    }
    tap("Library")
    assertEquals("R2 Rich reading",d.wait(Until.findObject(By.desc("Search resources")),10000).text)
    tap("Home"); tap("Resume reading R2 Rich reading")
    assertSame(retained,web()); assertEquals("\"retained\"",js(retained,"window.__prototypeIdentity"))
    assertEquals("Reading offset (CSS pixel rounding)",scroll.toDouble(),js(retained,"window.scrollY").toDouble(),2.0)
    d.findObject(By.descContains("Choose source")).click()
    assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000)); frame("sources")
    tap("Done")
    assertTrue(d.wait(Until.gone(By.text("Sources")),5000)); assertSame(retained,web())
    assertEquals("Reading offset (CSS pixel rounding)",scroll.toDouble(),js(retained,"window.scrollY").toDouble(),2.0)
    val context=d.findObject(By.descContains("Choose source")).visibleCenter
    d.click(context.x,context.y); Thread.sleep(120); d.pressBack(); Thread.sleep(500)
    assertFalse("Back must reverse Sources entry",d.hasObject(By.text("Sources")))
    assertTrue(d.hasObject(By.desc("Reading options"))); assertSame(retained,web())
    tap("Reading options"); tap("Vaultor options")
    assertTrue(d.wait(Until.hasObject(By.desc("Collections")),5000))
    tap("Pinned"); assertTrue(d.wait(Until.hasObject(By.text("Pinned")),5000))
    tap("Library")
    assertEquals("R2 Rich reading",d.wait(Until.findObject(By.desc("Search resources")),10000).text)
    d.findObject(By.descContains("Choose source")).click()
    assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000))
    var downloaded=d.findObject(By.descStartsWith("Read downloaded "))
    if(downloaded==null)downloaded=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.descStartsWith("Read downloaded ")))
    val react=(i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
    val presentation=react.getNativeModule("VaultorPresentation") as VaultorPresentation
    val feedback=VaultorPresentation::class.java.getDeclaredField("lastFeedback").apply{isAccessible=true}
    lateinit var previous:JSONObject; i.runOnMainSync{previous=feedback.get(presentation) as JSONObject}
    assertNotNull("Verified fixture download missing",downloaded); downloaded!!.click()
    assertTrue(d.wait(Until.gone(By.text("Sources")),10000))
    assertTrue(d.wait(Until.hasObject(By.descContains("Downloaded · offline")),10000))
    var report=previous
    repeat(20){i.runOnMainSync{report=feedback.get(presentation) as JSONObject};if(report===previous)Thread.sleep(100)}
    assertNotSame("Source confirmation must survive the sheet's window release",previous,report)
    assertEquals("selection",report.optString("event"))
  }
  @Test fun adaptiveAndReducedEndpoints() {
    val oldFont=d.executeShellCommand("settings get system font_scale").trim()
    val oldMotion=d.executeShellCommand("settings get global transition_animation_scale").trim()
    fun launch() {
      i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000))
      if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
      tap("Home")
      // Font-scale changes may recreate the Activity after its first frame.
      Thread.sleep(1500)
      if(d.hasObject(By.desc("Browse navigation"))) { tap("Browse navigation"); tap("Home") }
    }
    try {
      d.executeShellCommand("settings put system font_scale 1.0")
      d.executeShellCommand("wm size 840x1800"); d.executeShellCommand("wm density 420")
      Thread.sleep(1800); launch()
      val narrowHome=d.findObject(By.desc("Home")).visibleBounds
      val narrowReview=d.findObject(By.desc("Review")).visibleBounds
      val narrowSource=d.findObject(By.descContains("Choose source")).visibleBounds
      assertTrue("Narrow window must stack without undersized targets",narrowSource.top>=narrowHome.bottom && narrowReview.width()>=126 && narrowReview.height()>=126)
      frame("narrow")
      d.executeShellCommand("wm size 2400x1800"); d.executeShellCommand("wm density 240")
      Thread.sleep(1800); launch()
      val home=d.findObject(By.desc("Home")).visibleBounds
      val source=d.findObject(By.descContains("Choose source")).visibleBounds
      assertTrue("Wide layout must be a left rail",home.right<400 && source.left<400 && source.top>home.bottom)
      frame("wide")
      d.executeShellCommand("wm size reset"); d.executeShellCommand("wm density reset")
      d.executeShellCommand("settings put system font_scale 2.0")
      Thread.sleep(1800); launch()
      val largeHome=d.findObject(By.desc("Home")).visibleBounds
      val largeSource=d.findObject(By.descContains("Choose source")).visibleBounds
      frame("large-text")
      assertTrue("Large-text compact navigation must stack: $largeSource / $largeHome",largeSource.top>=largeHome.bottom)
      d.executeShellCommand("settings put global transition_animation_scale 0")
      Thread.sleep(500)
      tap("Resume reading R2 Rich reading")
      assertTrue(d.wait(Until.hasObject(By.desc("Browse navigation")),5000))
      tap("Browse navigation"); assertTrue(d.hasObject(By.desc("Review")))
      tap("Focus reading"); assertFalse(d.hasObject(By.desc("Review")))
      d.findObject(By.descContains("Choose source")).click()
      assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000)); tap("Done")
      assertTrue(d.wait(Until.gone(By.text("Sources")),3000)); frame("reduced")
    } finally {
      d.executeShellCommand("wm size reset"); d.executeShellCommand("wm density reset")
      d.executeShellCommand(if(oldFont=="null")"settings delete system font_scale" else "settings put system font_scale $oldFont")
      d.executeShellCommand(if(oldMotion=="null")"settings delete global transition_animation_scale" else "settings put global transition_animation_scale $oldMotion")
    }
  }
}
