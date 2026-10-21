package com.vaultorandroid

import android.content.Intent
import android.provider.Settings
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
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PresentationExperienceTest {
  init { require(android.os.Build.HARDWARE == "ranchu") { "Emulator-only acceptance" } }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val d get() = UiDevice.getInstance(i)
  private fun result(action: (PromiseImpl) -> Unit): String {
    val latch = CountDownLatch(1); var value = ""; var failed = false
    action(PromiseImpl(Callback { v -> value = v[0]?.toString() ?: "null"; latch.countDown() }, Callback { failed = true; latch.countDown() }))
    assertTrue(latch.await(10, TimeUnit.SECONDS)); assertFalse(failed); return value
  }
  private fun tap(label: String) {
    var target = d.findObject(By.desc(label))
    if (target == null) {
      val scroll = d.findObject(By.scrollable(true))
      target = scroll?.scrollUntil(Direction.DOWN, Until.findObject(By.desc(label)))
    }
    assertNotNull("Control absent: $label", target)
    val r = target!!.visibleBounds; assertFalse(r.isEmpty); d.click(r.centerX(), r.centerY())
  }
  private fun open() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.pkg("com.vaultor.app")), 30000))
    if (d.wait(Until.hasObject(By.desc("Open navigation").enabled(true)), 5000)) {
      tap("Open navigation"); assertTrue(d.wait(Until.hasObject(By.desc("Appearance & reading")), 5000)); tap("Appearance & reading")
    } else {
      assertTrue(d.wait(Until.hasObject(By.desc("Appearance & reading")), 20000)); tap("Appearance & reading")
    }
    assertTrue(d.wait(Until.hasObject(By.desc("OLED")), 5000))
  }
  private fun preference(): JSONObject = JSONObject(result { VaultorModule(BridgeReactContext(i.targetContext)).readerPreferences("get", "{}", it) })
  private fun waitPreference(key: String, value: String) {
    for (n in 0..40) { if (preference().optString(key) == value) return; Thread.sleep(100) }
    fail("Preference did not commit: $key")
  }
  @Test fun appearanceAndFeedback() {
    open()
    tap("Light"); waitPreference("theme", "light"); Thread.sleep(600)
    tap("Dark"); waitPreference("theme", "dark"); Thread.sleep(600)
    tap("OLED"); waitPreference("theme", "oled"); Thread.sleep(600)
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null), "a0-appearance-oled.png"))
    tap("Preview selection"); Thread.sleep(250); tap("Preview completion"); Thread.sleep(250)
    tap("Off"); waitPreference("haptics", "off")
    val ctx = (i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
    val module = ctx.getNativeModule("VaultorPresentation") as VaultorPresentation
    var tag = 0
    i.runOnMainSync {
      fun find(v: View) {
        if (v.contentDescription?.toString() == "Preview selection") tag = v.id
        if (v is ViewGroup) for (n in 0 until v.childCount) find(v.getChildAt(n))
      }
      WindowInspector.getGlobalWindowViews().forEach(::find)
    }
    assertTrue(tag > 0)
    assertEquals("true", result { module.prepareTheme(tag.toDouble(), "capture-test", it) })
    val overlayField = VaultorPresentation::class.java.getDeclaredField("overlays").apply { isAccessible = true }
    i.runOnMainSync {
      val overlays=overlayField.get(module) as List<*>
      assertEquals(2,overlays.size)
      val bytes=overlays.sumOf{overlay-> val bitmap=overlay!!.javaClass.getDeclaredField("bitmap").apply{isAccessible=true}.get(overlay) as android.graphics.Bitmap;bitmap.allocationByteCount.toLong()}
      assertTrue("Theme snapshots must remain bounded at QHD",bytes<=32L*1024*1024)
    }
    result { module.revealTheme("capture-test", 200.0, it) }
    Thread.sleep(350)
    i.runOnMainSync { assertTrue((overlayField.get(module) as List<*>).isEmpty()) }
    assertEquals("silent", result { module.feedback("complete", "REVIEW_CAPTURED", tag.toDouble(), "off-test", it) })
    tap("System"); waitPreference("haptics", "system")
    val previous = d.executeShellCommand("settings get system haptic_feedback_enabled").trim()
    try {
      d.executeShellCommand("settings put system haptic_feedback_enabled 0")
      assertEquals("silent", result { module.feedback("selection", "", tag.toDouble(), "system-off-test", it) })
      d.executeShellCommand("settings put system haptic_feedback_enabled 1")
      val played = result { module.feedback("selection", "", tag.toDouble(), "system-on-test", it) }
      assertTrue("Foreground semantic feedback suppressed", played in listOf("system", "envelope", "primitives", "predefined"))
      assertEquals("silent", result { module.feedback("selection", "", tag.toDouble(), "system-on-test", it) })
    } finally {
      if (previous == "null") d.executeShellCommand("settings delete system haptic_feedback_enabled")
      else d.executeShellCommand("settings put system haptic_feedback_enabled $previous")
    }
    tap("Done")
    assertTrue(d.wait(Until.gone(By.desc("Preview selection")), 5000))
  }
  @Test fun reducedMotionInsetsAndRetention() {
    val scale = d.executeShellCommand("settings get global transition_animation_scale").trim()
    try {
      d.executeShellCommand("settings put global transition_animation_scale 0")
      open(); tap("Light"); waitPreference("theme", "light"); tap("Off"); waitPreference("haptics", "off")
      d.setOrientationLeft(); Thread.sleep(800)
      assertTrue(d.hasObject(By.desc("Done")))
      d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null), "a0-landscape-light.png"))
      tap("Done"); d.setOrientationNatural(); Thread.sleep(300)
      open(); assertTrue(preference().optString("haptics") == "off"); tap("Done")
    } finally {
      d.setOrientationNatural()
      if (scale == "null") d.executeShellCommand("settings delete global transition_animation_scale")
      else d.executeShellCommand("settings put global transition_animation_scale $scale")
    }
  }
}
