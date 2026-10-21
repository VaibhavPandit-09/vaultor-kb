package com.vaultorandroid

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** UI checks against an already approved disposable fixture. Never targets hardware. */
@RunWith(AndroidJUnit4::class)
class ShellExperienceTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val d get() = UiDevice.getInstance(i)
  private fun tap(label: String) {
    var control = d.wait(Until.findObject(By.desc(label).enabled(true)), 3000)
    if(control==null)control=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)))
    assertNotNull("Missing control: $label", control)
    control!!.click(); Thread.sleep(300)
  }
  private fun web(): WebView {
    var found: WebView? = null
    i.runOnMainSync {
      fun visit(v: View) {
        if (v is WebView) found = v
        if (v is ViewGroup) for (n in 0 until v.childCount) visit(v.getChildAt(n))
      }
      WindowInspector.getGlobalWindowViews().forEach(::visit)
    }
    return found ?: error("Reader not mounted")
  }
  @org.junit.After fun capture() {
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null), "a1-shell.png"))
    d.dumpWindowHierarchy(File(i.targetContext.getExternalFilesDir(null), "a1-shell.xml"))
    d.unfreezeRotation()
  }
  @Test fun downloadedSourceActivation() {
    val address=InstrumentationRegistry.getArguments().getString("fixtureAddress")!!
    require(address.startsWith("https://127.0.0.1:"))
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.desc("Open navigation")),30000))
    val saved=org.json.JSONObject(i.targetContext.getSharedPreferences("reader-presentation-v1",android.content.Context.MODE_PRIVATE).getString("preferences","{}")?:"{}")
    android.util.Log.i("TestRunner","Positive source feedback precondition: saved app haptics="+saved.optString("haptics","system"))
    // Explicit positive-feedback case, independently of prior Off-policy tests.
    tap("Open navigation");tap("Appearance & reading");tap("System");tap("Done")
    d.executeShellCommand("settings put system haptic_feedback_enabled 1")
    d.findObject(By.descContains("Choose source")).click()
    val label="Read downloaded R4 offline fixture from "+address
    var row=d.wait(Until.findObject(By.desc(label)),2000)
    if(row==null) row=d.findObject(By.scrollable(true)).scrollUntil(Direction.DOWN,Until.findObject(By.desc(label)))
    val context=(i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as com.facebook.react.bridge.ReactApplicationContext
    val presentation=context.getNativeModule("VaultorPresentation") as VaultorPresentation
    val feedback=VaultorPresentation::class.java.getDeclaredField("lastFeedback").apply{isAccessible=true}
    lateinit var previous:org.json.JSONObject;i.runOnMainSync{previous=feedback.get(presentation) as org.json.JSONObject}
    assertNotNull("Exact downloaded source absent",row);row!!.click()
    assertTrue(d.wait(Until.gone(By.text("Sources")),10000))
    assertTrue(d.wait(Until.hasObject(By.descContains("Downloaded · offline")),10000))
    var report=org.json.JSONObject()
    repeat(20){i.runOnMainSync{report=feedback.get(presentation) as org.json.JSONObject};if(report===previous || report.optString("event")!="selection" || report.optString("profile")!="")Thread.sleep(100)}
    assertNotSame("Source must emit its own new confirmation, not reuse prior Fit feedback",previous,report)
    assertEquals("selection",report.optString("event"));assertEquals("",report.optString("profile"))
    assertTrue("Source confirmation must reach the focused visible engine: $report",report.optString("status") in setOf("requested","rejected"))
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"a1-downloaded.png"))
  }
  @Test fun readerSourceAndDrawerContinuity() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    tap("Open navigation"); tap("Library")
    val search = d.wait(Until.findObject(By.desc("Search resources")), 15000)
    search.text = "R2 Rich reading"; d.pressBack()
    val row = d.wait(Until.findObject(By.desc("R2 Rich reading, Note")), 15000)
    assertNotNull("Fixture reader absent", row); row!!.click()
    assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),15000)); Thread.sleep(800)
    val retained = web()
    val latch = java.util.concurrent.CountDownLatch(1)
    i.runOnMainSync { retained.evaluateJavascript("window.__a1Identity='retained';window.scrollTo(0,400);true") { latch.countDown() } }
    assertTrue(latch.await(5, java.util.concurrent.TimeUnit.SECONDS))
    d.findObject(By.descContains("Choose source")).click()
    assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000))
    assertSame("Source selection remounted reader", retained, web())
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"a1-sources.png"))
    d.pressBack(); Thread.sleep(400); assertSame(retained,web())
    tap("Reading options"); tap("Note outline"); assertTrue(d.wait(Until.hasObject(By.text("Note outline")),5000));
    d.pressBack(); Thread.sleep(300); assertSame(retained,web())

    tap("Open navigation"); tap("Collapse recent"); d.pressBack()
    tap("Open navigation"); assertNotNull(d.findObject(By.desc("Expand recent")))
    tap("Home"); assertTrue(d.wait(Until.hasObject(By.desc("Resume reading R2 Rich reading")),5000))
    tap("Resume reading R2 Rich reading"); assertSame(retained,web())
    d.setOrientationLeft(); Thread.sleep(800)
    tap("Open navigation"); assertTrue(d.findObject(By.desc("Close navigation")).visibleBounds.width() > 0)
    d.pressBack(); d.setOrientationNatural(); Thread.sleep(800)
    assertSame(retained,web())
    val checked = java.util.concurrent.CountDownLatch(1); var identity = ""
    i.runOnMainSync { retained.evaluateJavascript("window.__a1Identity") { identity=it;checked.countDown() } }
    assertTrue(checked.await(5,java.util.concurrent.TimeUnit.SECONDS)); assertEquals("\"retained\"",identity)
  }
}
