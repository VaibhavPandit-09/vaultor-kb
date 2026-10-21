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
  private val title get()=InstrumentationRegistry.getArguments().getString("noteTitle") ?: "R2 Rich reading"
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
  /** Run as an isolated instrumentation call; restore native fixture routing on exit. */
  @Test fun quickSwitchRetainsSourceSpecificBrowsing() {
    val a=org.json.JSONObject(File(i.targetContext.cacheDir,"r6-live-review.json").readText())
    val m=VaultorModule(com.facebook.react.bridge.BridgeReactContext(i.targetContext))
    fun result(call:(com.facebook.react.bridge.PromiseImpl)->Unit):String {var raw="";var failed=false;val latch=CountDownLatch(1);call(com.facebook.react.bridge.PromiseImpl(com.facebook.react.bridge.Callback{raw=it[0].toString();latch.countDown()},com.facebook.react.bridge.Callback{failed=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failed);return raw}
    fun restore(){val active=org.json.JSONObject(result{m.activate(a.getString("hostId"),it)});result{m.selectWorkspace(a.getString("hostId"),active.getString("epoch"),a.getString("workspaceId"),a.getString("generation"),it)}}
    restore()
    try {
      launch();if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
      tap("Library");d.wait(Until.findObject(By.desc("Search resources")),10000).text=title;Thread.sleep(800)
      val scope=org.json.JSONArray(listOf(a.getString("hostId"),a.getString("workspaceId"),a.getString("generation"))).toString()
      d.findObject(By.descContains("Choose source")).click();assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000))
      val local=d.wait(Until.findObject(By.descContains("Available offline").enabled(true)),10000);assertNotNull(local);local.click()
      assertTrue(d.wait(Until.gone(By.text("Sources")),10000));assertTrue(d.wait(Until.hasObject(By.descContains("Downloaded · offline")),10000))
      // Source activation may correctly restore that source's existing reader.
      if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
      tap("Library");d.wait(Until.findObject(By.desc("Search resources")),10000).text="R2";Thread.sleep(800)
      assertEquals("R2",d.findObject(By.desc("Search resources")).text)
      val original=org.json.JSONObject(result{m.storage("getSession",org.json.JSONObject().put("scope",scope).toString(),it)})
      assertEquals("Switching must preserve the original source query",title,original.getJSONObject("browse").getString("query"))
    } finally {restore()}
  }
  @Test fun readingAppearanceKeyboardBackRetainsReader() {
    val old=d.executeShellCommand("settings get secure show_ime_with_hard_keyboard").trim()
    try {
      d.executeShellCommand("settings put secure show_ime_with_hard_keyboard 1");launch()
      if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
      tap("Library");d.wait(Until.findObject(By.desc("Search resources")),10000).text=title;Thread.sleep(700);tap("$title, Note")
      val retained=web();tap("Reading appearance")
      val field=d.wait(Until.findObject(By.desc("Text size")),10000);field.click()
      fun ime():Boolean {var visible=false;i.runOnMainSync{visible=WindowInspector.getGlobalWindowViews().any{it.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime())==true}};return visible}
      repeat(30){if(!ime())Thread.sleep(100)};assertTrue("Actual appearance IME required",ime())
      d.pressBack();repeat(30){if(ime())Thread.sleep(100)};assertFalse(ime());assertTrue("First Back must retain appearance",d.hasObject(By.text("Reading appearance")))
      Thread.sleep(300);d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Browse navigation")),5000));assertSame(retained,web())
    } finally {d.executeShellCommand(if(old=="null")"settings delete secure show_ime_with_hard_keyboard" else "settings put secure show_ime_with_hard_keyboard $old")}
  }
  @org.junit.After fun captureEndpoint(){frame("last");d.dumpWindowHierarchy(File(i.targetContext.getExternalFilesDir(null),"batch1-last.xml"))}
  @Test fun sourceAppearanceAndSpatialReturn() {
    launch()
    if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
    tap("Home")
    d.findObject(By.descContains("Choose source")).click()
    assertTrue(d.wait(Until.hasObject(By.text("Sources")),5000))
    assertFalse("Trust operations must not be in quick switching",d.hasObject(By.desc("Forget approval")))
    assertFalse("Pairing must not be in quick switching",d.hasObject(By.desc("Pair with host")))
    d.findObject(By.scrollable(true))?.scroll(Direction.DOWN,0.8f);Thread.sleep(1000)
    tap("Source management")
    assertTrue("Management must replace quick switching",d.wait(Until.gone(By.text("Sources")),5000))
    var pairing=d.findObject(By.desc("Pair with host"));if(pairing==null)pairing=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc("Pair with host")));assertNotNull("Management retains pairing even for forgotten-host downloads",pairing);tap("Done")
    assertTrue(d.wait(Until.gone(By.text("Source management")),5000))
    tap("Library")
    val input=d.wait(Until.findObject(By.desc("Search resources")),10000)
    input.text=title;Thread.sleep(800)
    val row=d.wait(Until.findObject(By.desc("$title, Note")),10000);assertNotNull(row)
    val center=row!!.visibleCenter
    // Native bounds sampled without UI-idle waits certify actual intermediate geometry.
    val heights=mutableSetOf<Int>();d.click(center.x,center.y)
    repeat(18){Thread.sleep(25);heights.add(apertureHeight())}
    assertTrue(d.wait(Until.hasObject(By.desc("Reading appearance")),10000))
    assertTrue("Reader aperture must change geometry in motion: $heights",heights.filter{it>0}.distinct().size>1)
    assertEquals("Only visible reader source may be exposed",1,d.findObjects(By.descContains("Choose source")).size)
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
    assertEquals(title,d.wait(Until.findObject(By.desc("Search resources")),10000).text)
    assertSame(retained,web());frame("return")
    tap("$title, Note")
    assertTrue(d.wait(Until.hasObject(By.desc("Reading appearance")),10000));assertSame(retained,web())
    assertEquals(scroll,js(retained,"window.scrollY").toDouble(),3.0)
    tap("Reading appearance");tap("Settings")
    assertTrue(d.wait(Until.hasObject(By.text("Settings & tools")),5000));tap("Done")
  }
}
