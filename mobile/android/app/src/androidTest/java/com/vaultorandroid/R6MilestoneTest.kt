package com.vaultorandroid

import android.content.Intent
import android.os.Process
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inspector.WindowInspector
import android.webkit.WebView
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

/** Staged, real retained-reader/Review checks. Emulator + disposable approved host only. */
@RunWith(AndroidJUnit4::class)
class R6MilestoneTest {
  init { require(android.os.Build.HARDWARE=="ranchu") }
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val d get()=UiDevice.getInstance(i)
  private val ctx get()=i.targetContext
  private fun module()=VaultorModule(BridgeReactContext(ctx))
  private fun call(block:(PromiseImpl)->Unit):String {val done=CountDownLatch(1);var raw="";var refused=false;block(PromiseImpl(Callback{raw=it[0].toString();done.countDown()},Callback{refused=true;done.countDown()}));assertTrue(done.await(90,TimeUnit.SECONDS));assertFalse("Native operation refused",refused);return raw}
  private fun rows()=JSONArray(call{module().reviewCapture("list","{}",it)})
  private fun items():List<JSONObject>{val all=rows();return (0 until all.length()).map{all.getJSONObject(it)}}
  private fun get(id:String)=JSONObject(call{module().reviewCapture("get",JSONObject().put("id",id).toString(),it)})
  private fun bootstrap()=JSONObject(call{module().storage("bootstrap","{}",it)})
  private fun meta()=JSONObject(File(ctx.cacheDir,"r6-live-review.json").readText())
  private val marker get()=File(ctx.cacheDir,"r6-milestone.json")
  private fun data()=if(marker.exists())JSONObject(marker.readText())else JSONObject()
  private fun remember(key:String,value:Any){val valueNow=data();valueNow.put(key,value);marker.writeText(valueNow.toString())}
  private fun tap(label:String){var n=d.wait(Until.findObject(By.desc(label).enabled(true)),5000);if(n==null)n=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)));assertNotNull(label,n);n!!.click();Thread.sleep(300)}
  private fun launch(){ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000));Thread.sleep(900)}
  private fun web():WebView {var found:WebView?=null;i.runOnMainSync{fun visit(v:View){if(v is WebView)found=v;if(v is ViewGroup)for(n in 0 until v.childCount)visit(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::visit)};return found?:error("Retained reader missing")}
  private fun js(code:String):String {var raw="";val done=CountDownLatch(1);val w=web();i.runOnMainSync{w.evaluateJavascript(code){raw=it;done.countDown()}};assertTrue(done.await(10,TimeUnit.SECONDS));return raw}
  private fun reader(){val title=InstrumentationRegistry.getArguments().getString("noteTitle") ?: "R2 Rich reading";launch();if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation");tap("Library");d.wait(Until.findObject(By.desc("Search resources")),10000).text=title;Thread.sleep(650);val row=d.wait(Until.findObject(By.descStartsWith("$title, Note")),10000);assertNotNull("Requested resource row",row);row!!.click();Thread.sleep(300);assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),10000));repeat(100){if(js("!!document.querySelector('article p')")=="true")return;Thread.sleep(100)};fail("Reader loading")}
  private fun flag(){js("(()=>{const p=document.querySelector('article p');const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));return true})()");tap("Flag for review");assertTrue(d.wait(Until.hasObject(By.desc("Review comment")),10000))}
  private fun write(comment:String){d.findObject(By.desc("Review comment")).text=comment;assertTrue(d.wait(Until.hasObject(By.text("Draft protected on this phone · "+comment.length+"/5000")),10000))}
  private fun saved(comment:String)=items().first{it.getJSONObject("body").getString("comment")==comment}
  private fun waitSynced(id:String){repeat(240){if(get(id).optJSONObject("delivery")?.optString("state")=="synced")return;Thread.sleep(500)};fail("Automatic delivery did not acknowledge the Review")}
  @org.junit.After fun endpoint(){d.takeScreenshot(File(ctx.getExternalFilesDir(null),"r6-milestone-last.png"));d.dumpWindowHierarchy(File(ctx.getExternalFilesDir(null),"r6-milestone-last.xml"))}

  @Test fun seedAlpha21UpgradeProtection() {
    val m=module();val store=VaultorReviews(File(ctx.noBackupFilesDir,"vaultor-reviews.bin")){val k=java.security.KeyStore.getInstance("AndroidKeyStore");k.load(null);k.getKey("vaultor-local-v1",null) as javax.crypto.SecretKey}; rows();val source=JSONObject().put("scope",JSONArray(listOf("00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","upgrade-generation")).toString()).put("resourceId","00000000-0000-4000-8000-000000000003").put("targetTitle","R6 upgrade fixture").put("targetType","note").put("baseRevision","upgrade-r1").put("quote","retained evidence").put("context","retained context").put("locator",JSONObject().put("kind","resource"))
    for(queued in listOf(false,true)){val draft=JSONObject(store.execute("begin",source));val id=draft.getString("id");store.execute("put",JSONObject().put("id",id).put("version",0).put("comment",if(queued)"R6 upgrade queued" else "R6 upgrade unfinished"));if(queued)store.execute("queue",JSONObject().put("id",id).put("version",1))}
    remember("upgradeReviews",rows());remember("upgradeBootstrap",bootstrap());remember("upgradeReading",JSONObject(call{m.readerPreferences("get","{}",it)}));remember("upgradeDownloads",JSONArray(call{m.companion("list","{}",it)}))
  }
  @Test fun verifyInstallOverProtectedState() {
    val before=data();val previous=before.getJSONArray("upgradeReviews")
    for(n in 0 until previous.length()){val old=previous.getJSONObject(n);val actual=get(old.getString("id"));for(key in listOf("id","state","version","source","body","createdAt"))assertEquals("Install-over preserves frozen $key",old.get(key).toString(),actual.get(key).toString())}
    val b=bootstrap();assertEquals(before.getJSONObject("upgradeBootstrap").getString("selected"),b.getString("selected"));assertEquals(before.getJSONObject("upgradeBootstrap").getJSONArray("profiles").toString(),b.getJSONArray("profiles").toString());assertEquals(before.getJSONObject("upgradeBootstrap").getJSONObject("sessions").toString(),b.getJSONObject("sessions").toString())
    val m=module();assertEquals(before.getJSONObject("upgradeReading").toString(),JSONObject(call{m.readerPreferences("get","{}",it)}).toString())
    val jobs=JSONArray(call{m.companion("list","{}",it)});val oldJobs=before.getJSONArray("upgradeDownloads");assertEquals(oldJobs.length(),jobs.length());for(n in 0 until oldJobs.length()){val old=oldJobs.getJSONObject(n);val actual=(0 until jobs.length()).map{jobs.getJSONObject(it)}.first{it.getString("id")==old.getString("id")};assertEquals(old.getString("scope"),actual.getString("scope"))}
  }
  @Test fun prepareRetainedMilestoneReader() {
    val m=module();val a=meta();val active=JSONObject(call{m.activate(a.getString("hostId"),it)});val selected=JSONObject(call{m.selectWorkspace(a.getString("hostId"),active.getString("epoch"),a.getString("workspaceId"),a.getString("generation"),it)})
    val scope=JSONArray(listOf(a.getString("hostId"),a.getString("workspaceId"),a.getString("generation"))).toString();val input=JSONObject(selected.toString()).put("scope",scope).put("name","R6 milestone offline").put("selection",JSONObject().put("scope","workspace").put("ids",JSONArray()).put("dependencies","linked").put("files","readable"))
    call{m.companion("policyPut",JSONObject().put("budgetMiB",128).put("metered",true).put("lowBattery",true).toString(),it)}
    val id=JSONObject(call{m.companion("start",input.toString(),it)}).getString("id");var ready=false
    repeat(600){if(!ready){val jobs=JSONArray(call{m.companion("list","{}",it)});val job=(0 until jobs.length()).map{jobs.getJSONObject(it)}.first{it.getString("id")==id};if(job.getString("status")=="ready" && !job.optBoolean("workerActive"))ready=true else {assertTrue(job.toString(),job.getString("status") in listOf("downloading","ready"));Thread.sleep(100)}}};assertTrue(ready)
    val note=InstrumentationRegistry.getArguments().getString("readerId")!!;remember("readerId",note);remember("readerScope",scope)
    call{m.companion("activate",JSONObject().put("scope",scope).toString(),it)}
    call{m.storage("putSession",JSONObject().put("scope",scope).put("hostId",a.getString("hostId")).put("noteId",note).put("view","note").put("noteOrigin","browse").put("localOnly",true).put("position",JSONObject().put("scroll",0).put("anchor",0).put("head",0)).put("journey",JSONObject().put("visits",JSONArray().put(JSONObject().put("id",note).put("title","R2 Rich reading"))).put("cursor",0)).toString(),it)}
  }
  @Test fun draftAndOneCreateAutomaticallyDeliver() {
    reader();val retained=web();js("window.__r6Node=document.querySelector('article p');true");flag()
    assertFalse("Empty R5 comment cannot create",d.findObject(By.desc("Create Review")).isEnabled);assertFalse(d.hasObject(By.desc("Save on this phone")));assertFalse(d.hasObject(By.desc("Done")))
    write("R6 unfinished milestone concern");tap("Keep draft");assertSame(retained,web());val unfinished=saved("R6 unfinished milestone concern");assertEquals("draft",unfinished.getString("state"));remember("unfinishedId",unfinished.getString("id"))
    flag();write("R6 automatic milestone concern");val create=d.findObject(By.desc("Create Review"));assertTrue(create.visibleBounds.height()>=100);tap("Create Review")
    assertTrue(d.wait(Until.hasObject(By.text("Review created")),10000));val frozen=saved("R6 automatic milestone concern");remember("automatic",frozen)
    waitSynced(frozen.getString("id"));assertTrue(d.wait(Until.hasObject(By.textContains("Synced · Open on desktop")),10000));assertEquals("draft",get(unfinished.getString("id")).getString("state"));tap("Done")
    assertSame(retained,web());assertEquals("true",js("window.__r6Node===document.querySelector('article p')"))
  }
  @Test fun captureAccessibilitySemantics() {
    reader();flag();assertFalse(d.hasObject(By.desc("Dismiss")))
    val create=d.findObject(By.desc("Create Review"));assertNotNull(create);assertTrue(create.isClickable);assertFalse(create.isEnabled)
    val input=d.findObject(By.desc("Review comment"));assertNotNull(input);assertEquals("android.widget.EditText",input.className)
    write("R6 accessible unfinished draft");var quiet=false
    i.runOnMainSync {fun visit(v:View){if(v is android.widget.TextView && v.text.toString().startsWith("Draft protected on this phone")){assertEquals(View.ACCESSIBILITY_LIVE_REGION_NONE,v.accessibilityLiveRegion);quiet=true};if(v is ViewGroup)for(n in 0 until v.childCount)visit(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::visit)}
    assertTrue("Draft counter must not announce every keystroke",quiet);assertTrue(d.findObject(By.desc("Create Review")).isEnabled);assertTrue(d.hasObject(By.desc("Keep draft")));tap("Keep draft");assertEquals("draft",saved("R6 accessible unfinished draft").getString("state"))
  }
  @Test fun offlineCreateAndDieAfterDurableQueue() {
    reader();js("window.scrollTo(0,500);true");Thread.sleep(700);remember("scroll",js("window.scrollY").toDouble());Log.i("VaultorR6Test","R6_WAIT_OFFLINE")
    var offline=false;repeat(120){if(!offline){try{module().reviewRequest(meta(),"/access/host");Thread.sleep(500)}catch(_:Exception){offline=true}}};assertTrue("Remove only the explicit emulator reverse mapping",offline)
    flag();write("R6 completed offline milestone");tap("Create Review");assertTrue(d.wait(Until.hasObject(By.text("Review created")),10000));val frozen=saved("R6 completed offline milestone");remember("offline",frozen);assertEquals("queued",frozen.getString("state"));assertNotEquals("synced",frozen.optJSONObject("delivery")?.optString("state"));tap("Done");Thread.sleep(700)
    Log.i("VaultorR6Test","R6_OFFLINE_CREATED");Process.killProcess(Process.myPid());Thread.sleep(10000);fail("Expected intentional process death")
  }
  @Test fun restoreOfflineReaderAndProtectedQueue() {
    launch();assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),30000));repeat(100){if(js("!!document.querySelector('article p')")!="true")Thread.sleep(100)};Thread.sleep(700)
    val a=data();val item=get(a.getJSONObject("offline").getString("id"));assertEquals("queued",item.getString("state"));assertNotEquals("synced",item.optJSONObject("delivery")?.optString("state"));assertEquals(a.getJSONObject("offline").getJSONObject("body").toString(),item.getJSONObject("body").toString());assertEquals("draft",get(a.getString("unfinishedId")).getString("state"))
    assertEquals("Cold reading position",a.getDouble("scroll"),js("window.scrollY").toDouble(),64.0)
  }
  @Test fun automaticReconnectAndDesktopStatus() {
    launch();val a=data();val frozen=a.getJSONObject("offline");waitSynced(frozen.getString("id"));val after=get(frozen.getString("id"));assertEquals(frozen.getJSONObject("body").toString(),after.getJSONObject("body").toString());assertEquals(frozen.getJSONObject("source").toString(),after.getJSONObject("source").toString());assertEquals("draft",get(a.getString("unfinishedId")).getString("state"))
    if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation");tap("Review");assertTrue(d.wait(Until.hasObject(By.textContains("Synced ·")),10000))
  }
  @Test fun automaticDesktopResolutionReconciliation() {
    launch();val a=data();val id=a.getJSONObject("offline").getString("id");var resolved=false;repeat(240){if(!resolved){resolved=get(id).optJSONObject("delivery")?.optJSONObject("receipt")?.optString("status")=="resolved";if(!resolved)Thread.sleep(500)}};assertTrue("Foreground catch-up must reflect desktop resolution without Sync now",resolved)
    assertEquals(a.getJSONObject("offline").getJSONObject("body").toString(),get(id).getJSONObject("body").toString());assertEquals("draft",get(a.getString("unfinishedId")).getString("state"))
  }
}
