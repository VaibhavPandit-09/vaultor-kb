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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ReaderMotionExperienceTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val d get() = UiDevice.getInstance(i)
  private fun tap(label:String) { var n=d.wait(Until.findObject(By.desc(label).enabled(true)),3000);if(n==null)n=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)));assertNotNull(label,n);n!!.click();Thread.sleep(450) }
  private fun launch() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000));Thread.sleep(1000)
  }
  private fun find(predicate:(View)->Boolean):View? { var result:View?=null;i.runOnMainSync { fun walk(v:View){if(predicate(v))result=v;if(v is ViewGroup)for(n in 0 until v.childCount)walk(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::walk) };return result }
  private fun web() = find { it is WebView } as WebView
  private fun js(w:WebView,code:String):String { var result="";val latch=CountDownLatch(1);i.runOnMainSync{w.evaluateJavascript(code){result=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return result }
  private fun apertureHeight():Int { val v=find { it.getTag(com.facebook.react.R.id.react_test_id)=="reader-aperture" };var height=0;i.runOnMainSync{height=v?.height?:0};return height }
  private fun frame(name:String) { d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"batch1-$name.png")) }
  @Test fun sourceAppearanceAndSpatialReturn() {
    launch()
    if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
    tap("Home")
    d.findObject(By.descContains("Choose source")).click()
    assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000))
    assertFalse("Trust operations must not be in quick switching",d.hasObject(By.desc("Forget approval")))
    assertFalse("Pairing must not be in quick switching",d.hasObject(By.desc("Pair with host")))
    tap("Source management")
    assertTrue(d.wait(Until.hasObject(By.text("Source management")),5000))
    var pairing=d.findObject(By.desc("Pair with host"));if(pairing==null)pairing=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc("Pair with host")));assertNotNull("Management retains pairing even for forgotten-host downloads",pairing);tap("Done")
    assertTrue(d.wait(Until.gone(By.text("Source management")),5000))
    tap("Library")
    val input=d.wait(Until.findObject(By.desc("Search resources")),10000)
    input.text="R2 Rich reading";Thread.sleep(800)
    val row=d.wait(Until.findObject(By.desc("R2 Rich reading, Note")),10000);assertNotNull(row)
    val center=row!!.visibleCenter
    // Native bounds sampled without UI-idle waits certify actual intermediate geometry.
    val heights=mutableSetOf<Int>();d.click(center.x,center.y)
    repeat(18){Thread.sleep(25);heights.add(apertureHeight())}
    assertTrue(d.wait(Until.hasObject(By.desc("Reading appearance")),10000))
    assertTrue("Reader aperture must change geometry in motion: $heights",heights.filter{it>0}.distinct().size>1)
    val retained=web();js(retained,"window.__batch1Node=document.querySelector('p');window.scrollTo(0,300);true")
    Thread.sleep(400);val scroll=js(retained,"window.scrollY").toDouble()
    tap("Reading appearance")
    assertTrue(d.hasObject(By.desc("Increase Text size")))
    tap("Increase Text size");tap("Decrease Text size")
    tap("Increase Line spacing");tap("Decrease Line spacing")
    tap("More reading settings");tap("Smooth");tap("Done")
    assertSame(retained,web());assertEquals("true",js(retained,"window.__batch1Node===document.querySelector('p')"))
    assertEquals(scroll,js(retained,"window.scrollY").toDouble(),3.0);frame("reader")
    tap("Back")
    assertEquals("R2 Rich reading",d.wait(Until.findObject(By.desc("Search resources")),10000).text)
    assertSame(retained,web());frame("return")
    tap("R2 Rich reading, Note")
    assertTrue(d.wait(Until.hasObject(By.desc("Reading appearance")),10000));assertSame(retained,web())
    assertEquals(scroll,js(retained,"window.scrollY").toDouble(),3.0)
    tap("Reading appearance");tap("Settings")
    assertTrue(d.wait(Until.hasObject(By.text("Settings & tools")),5000));tap("Done")
  }
}
