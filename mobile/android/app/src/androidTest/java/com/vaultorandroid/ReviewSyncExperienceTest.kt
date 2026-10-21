package com.vaultorandroid

import android.content.Intent
import android.os.Process
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.SocketTimeoutException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.spec.SecretKeySpec

/** Real pinned HTTPS/approved disposable host; staged owner commands stay outside Android. */
@RunWith(AndroidJUnit4::class)
class ReviewSyncExperienceTest {
  init {require(android.os.Build.HARDWARE=="ranchu")}
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val args get()=InstrumentationRegistry.getArguments()
  private val ctx get()=BridgeReactContext(i.targetContext)
  private val d get()=UiDevice.getInstance(i)
  private val metaFile get()=File(i.targetContext.cacheDir,"r6-live-review.json")
  private fun meta()=JSONObject(metaFile.readText())
  private fun store()=VaultorReviews(File(i.targetContext.cacheDir,"r6-live-review.bin")){SecretKeySpec(ByteArray(32){(it+1).toByte()},"AES")}
  private fun result(call:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var result="";var failed=false;call(PromiseImpl(Callback{result=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(120,TimeUnit.SECONDS));assertFalse("Native operation refused",failed);return result}
  private fun bootstrap(m:VaultorModule)=JSONObject(result{m.storage("bootstrap","{}",it)})
  private fun port(m:VaultorModule)=object:VaultorReviewSync.Port {override fun request(source:JSONObject,path:String,method:String,body:String?)=m.reviewRequest(source,path,method,body)}
  private fun source(a:JSONObject)=JSONObject().put("hostId",a.getString("hostId")).put("workspaceId",a.getString("workspaceId")).put("generation",a.getString("generation"))
  private fun queue(a:JSONObject,comment:String):JSONObject {
    val input=JSONObject().put("scope",JSONArray(listOf(a.getString("hostId"),a.getString("workspaceId"),a.getString("generation"))).toString()).put("resourceId",a.getString("noteId")).put("targetTitle","R6 Review fixture").put("targetType","note").put("baseRevision",a.getString("revision")).put("quote","R6 immutable source evidence").put("context","R6 immutable source evidence for controlled delivery tests.").put("locator",JSONObject().put("kind","resource"))
    val draft=JSONObject(store().execute("begin",input));val id=draft.getString("id")
    store().execute("put",JSONObject().put("id",id).put("version",0).put("comment",comment))
    return JSONObject(store().execute("queue",JSONObject().put("id",id).put("version",1)))
  }
  @Test fun pairAndLoseActualHostAcknowledgment() {
    val address=args.getString("address")!!;require(address.matches(Regex("https://127\\.0\\.0\\.1:[0-9]+")))
    if(android.os.Build.VERSION.SDK_INT>=37)i.uiAutomation.grantRuntimePermission("com.vaultor.app",android.Manifest.permission.ACCESS_LOCAL_NETWORK)
    val m=VaultorModule(ctx);val b=bootstrap(m);val profiles=b.getJSONArray("profiles")
    if(profiles.length()>=8) {
      val stopped=(0 until profiles.length()).map{profiles.getJSONObject(it)}.first{it.getString("hostId")!=b.getString("selected") && it.getString("address").startsWith("https://127.0.0.1:")}
      val captures=result{m.reviewCapture("list","{}",it)}
      result{m.signOut(stopped.getString("hostId"),it)}
      assertEquals("Forgetting test approval must retain protected captures",captures,result{m.reviewCapture("list","{}",it)})
    }
    val enrollment=JSONObject(result{m.beginPairing(address,it)})
    Log.i("VaultorR6Test","R6_PAIR_CODE "+enrollment.getString("code")) // Public comparison code; never secret.
    var approved=false
    repeat(120){if(!approved){approved=JSONObject(result{m.completePairing(it)}).optString("state")=="APPROVED";if(!approved)Thread.sleep(1000)}}
    assertTrue("Matching disposable owner approval required",approved)
    val host=enrollment.getString("hostId");val active=JSONObject(result{m.activate(host,it)})
    val a=JSONObject().put("hostId",host).put("address",address).put("workspaceId",args.getString("workspaceId")).put("generation",args.getString("generation")).put("noteId",args.getString("noteId")).put("revision",args.getString("revision")).put("secondId",args.getString("secondId")).put("secondGeneration",args.getString("secondGeneration"))
    // Owner approval and the separate fixture workspace grant are distinct commits.
    var granted=false
    repeat(20){if(!granted){
      val response=JSONObject(result{m.apiFor(host,active.getString("epoch"),"/workspaces","GET",null,null,it)})
      if(response.getInt("status")==200){val rows=JSONArray(response.getString("body"));granted=(0 until rows.length()).any{rows.getJSONObject(it).getString("id")==a.getString("secondId")}}
      if(!granted)Thread.sleep(500)
    }}
    assertTrue("The separately authorized fixture workspace grant must settle",granted)
    result{m.selectWorkspace(host,active.getString("epoch"),a.getString("secondId"),a.getString("secondGeneration"),it)}
    val before=bootstrap(m);val frozen=queue(a,"R6 lost receipt across process restart")
    val real=port(m);val lost=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
        val response=real.request(source,path,method,body)
        if(method=="PUT" && response.getInt("status") in 200..299)throw SocketTimeoutException("Synthetic loss after actual committed host response")
        return response
      }
    }
    VaultorReviewSync(store(),lost).sync(true)
    val item=store().snapshot().first{it.getString("id")==frozen.getString("id")}
    assertEquals("unknown",item.getJSONObject("delivery").getString("state"))
    assertEquals(before.getString("selected"),bootstrap(m).getString("selected"));assertEquals(before.getString("epoch"),bootstrap(m).getString("epoch"))
    a.put("id",item.getString("id")).put("body",item.getJSONObject("body"));metaFile.writeText(a.toString())
  }
  @Test fun resumeExactAfterProcessRestart() {
    val m=VaultorModule(ctx);val a=meta();val before=bootstrap(m)
    VaultorReviewSync(store(),port(m)).sync(true)
    val item=store().snapshot().first{it.getString("id")==a.getString("id")}
    assertEquals("synced",item.getJSONObject("delivery").getString("state"));assertEquals(a.getJSONObject("body").toString(),item.getJSONObject("body").toString())
    assertEquals(before.getString("epoch"),bootstrap(m).getString("epoch"))
    val selected=(0 until before.getJSONArray("profiles").length()).map{before.getJSONArray("profiles").getJSONObject(it)}.first{it.getString("hostId")==a.getString("hostId")}
    assertEquals("Queue dispatch must not activate its captured workspace",a.getString("secondId"),selected.getString("workspaceId"))
    val wrong=source(a).put("workspaceId",a.getString("secondId")).put("generation",a.getString("secondGeneration"))
    assertEquals("Equal resource IDs must not misdirect Review identity",404,m.reviewRequest(wrong,"/reviews/"+a.getString("id")).getInt("status"))
  }
  @Test fun recoverAfterFreshApprovalWithoutChangingFrozenIntent() {
    val m=VaultorModule(ctx);val a=meta();val before=bootstrap(m)
    result{m.selectWorkspace(a.getString("hostId"),before.getString("epoch"),a.getString("secondId"),a.getString("secondGeneration"),it)}
    val routed=bootstrap(m);VaultorReviewSync(store(),port(m)).sync(true)
    val item=store().snapshot().first{it.getString("id")==a.getString("id")}
    assertEquals("synced",item.getJSONObject("delivery").getString("state"));assertEquals(a.getJSONObject("body").toString(),item.getJSONObject("body").toString())
    assertEquals(routed.getString("epoch"),bootstrap(m).getString("epoch"))
  }
  @Test fun reflectDesktopResolutionWithoutBodyMutation() {
    val a=meta();VaultorReviewSync(store(),port(VaultorModule(ctx))).sync(refresh=true)
    val item=store().snapshot().first{it.getString("id")==a.getString("id")}
    assertEquals("resolved",item.getJSONObject("delivery").getJSONObject("receipt").getString("status"))
    assertEquals(a.getJSONObject("body").toString(),item.getJSONObject("body").toString())
  }
  @Test fun dieAfterDurableSendingClaim() {
    val a=meta();val next=queue(a,"R6 durable claim interrupted before dispatch");a.put("claimId",next.getString("id"));metaFile.writeText(a.toString())
    val real=port(VaultorModule(ctx));val kill=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
        if(method=="PUT") { assertEquals("sending",store().snapshot().first{it.getString("id")==next.getString("id")}.getJSONObject("delivery").getString("state"));Process.killProcess(Process.myPid());Thread.sleep(10000) }
        return real.request(source,path,method,body)
      }
    }
    VaultorReviewSync(store(),kill).sync(true);fail("Expected intentional process death")
  }
  @Test fun resumeSendingAfterDeath() {
    val m=VaultorModule(ctx);val a=meta();VaultorReviewSync(store(),port(m)).sync(true)
    assertEquals("synced",store().snapshot().first{it.getString("id")==a.getString("claimId")}.getJSONObject("delivery").getString("state"))
    result{m.selectWorkspace(a.getString("hostId"),bootstrap(m).getString("epoch"),a.getString("workspaceId"),a.getString("generation"),it)}
    val blocked=JSONObject(a.toString()).put("generation","wrong-generation")
    val wrong=queue(blocked,"Wrong generation must never dispatch")
    VaultorReviewSync(store(),port(m)).sync(true)
    assertEquals("REVIEW_GENERATION_CHANGED",store().snapshot().first{it.getString("id")==wrong.getString("id")}.getJSONObject("delivery").getString("reason"))
  }
  @Test fun realOfflineQueueAndLaterConnection() {
    val a=meta();val queued=queue(a,"R6 offline actual transport queue");a.put("offlineId",queued.getString("id"));metaFile.writeText(a.toString())
    VaultorReviewSync(store(),port(VaultorModule(ctx))).sync(true)
    val item=store().snapshot().first{it.getString("id")==queued.getString("id")}
    assertEquals("queued",item.getJSONObject("delivery").getString("state"));assertEquals("HOST_UNAVAILABLE",item.getJSONObject("delivery").getString("reason"));assertFalse(item.getJSONObject("delivery").optBoolean("attempted"))
  }
  @Test fun resumeAfterActualConnectionReturns() {
    val a=meta();VaultorReviewSync(store(),port(VaultorModule(ctx))).sync(true)
    assertEquals("synced",store().snapshot().first{it.getString("id")==a.getString("offlineId")}.getJSONObject("delivery").getString("state"))
  }
  @Test fun seedConflictingIntent() {
    val a=meta();val queued=queue(a,"R6 local conflicting intent retained");a.put("conflictId",queued.getString("id"));metaFile.writeText(a.toString());Log.i("VaultorR6Test","R6_CONFLICT_ID "+queued.getString("id"))
  }
  @Test fun rejectActualConflictingServerIntent() {
    val a=meta();VaultorReviewSync(store(),port(VaultorModule(ctx))).sync(true)
    val item=store().snapshot().first{it.getString("id")==a.getString("conflictId")}
    assertEquals("REVIEW_ID_REUSED",item.getJSONObject("delivery").getString("reason"));assertEquals("R6 local conflicting intent retained",item.getJSONObject("body").getString("comment"))
  }
  private fun tap(label:String) {var n=d.wait(Until.findObject(By.desc(label).enabled(true)),10000);if(n==null)n=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)));assertNotNull(label,n);n!!.click();Thread.sleep(400)}
  @Test fun genuineProductionCaptureSyncNowAndRetainedReview() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000));Thread.sleep(1000)
    if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
    tap("Library");val input=d.wait(Until.findObject(By.desc("Search resources")),10000);input.text="R6 Review fixture";Thread.sleep(700)
    tap("R6 Review fixture, Note");assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),10000))
    tap("Reading options");tap("Add review item")
    val field=d.wait(Until.findObject(By.desc("Review comment")),10000);field.text="R6 actual production bridge capture"
    assertTrue(d.wait(Until.hasObject(By.text("Protected draft on this phone · 35/5000")),10000))
    tap("Save on this phone");assertTrue(d.wait(Until.hasObject(By.text("Saved on this phone")),10000));tap("Done")
    tap("Browse navigation");tap("Review")
    assertTrue(d.wait(Until.hasObject(By.text("Protected on this phone · all sources")),5000))
    d.wait(Until.gone(By.desc("Syncing…")),120000);tap("Sync now")
    assertTrue(d.wait(Until.hasObject(By.textContains("Synced · Open on desktop")),120000))
    val rows=JSONArray(result{VaultorModule(ctx).reviewCapture("list","{}",it)})
    val target=(0 until rows.length()).map{rows.getJSONObject(it)}.first{it.getJSONObject("body").optString("comment")=="R6 actual production bridge capture"}
    assertEquals("synced",target.getJSONObject("delivery").getString("state"));val a=meta();a.put("productionId",target.getString("id"));metaFile.writeText(a.toString())
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r6-review-synced.png"))
  }
  @Test fun productionReviewReflectsDesktopDismissal() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.descContains("Choose source").enabled(true)),30000));Thread.sleep(1000)
    if(d.hasObject(By.desc("Browse navigation")))tap("Browse navigation")
    tap("Review");d.wait(Until.gone(By.desc("Syncing…")),120000);tap("Sync now")
    assertTrue(d.wait(Until.hasObject(By.textContains("Synced · Dismissed")),120000))
    val m=VaultorModule(ctx);val a=meta();val item=JSONObject(result{m.reviewCapture("get",JSONObject().put("id",a.getString("productionId")).toString(),it)})
    assertEquals("dismissed",item.getJSONObject("delivery").getJSONObject("receipt").getString("status"));assertEquals("R6 actual production bridge capture",item.getJSONObject("body").getString("comment"))
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r6-review-dismissed.png"))
  }
  @Test fun nondefaultGrantDoesNotDependOnDefaultWorkspace() {
    val a=meta();val other=JSONObject(a.toString()).put("workspaceId",a.getString("secondId")).put("generation",a.getString("secondGeneration"))
    val queued=queue(other,"R6 independently granted workspace")
    val m=VaultorModule(ctx);val before=bootstrap(m);VaultorReviewSync(store(),port(m)).sync(true)
    assertEquals("synced",store().snapshot().first{it.getString("id")==queued.getString("id")}.getJSONObject("delivery").getString("state"))
    assertEquals(before.getString("epoch"),bootstrap(m).getString("epoch"))
  }
  @Test fun revokedAndUnavailableSourcesRetainReceiptsAndQueue() {
    val a=meta();val queued=queue(a,"R6 revoked source remains protected")
    VaultorReviewSync(store(),port(VaultorModule(ctx))).sync(true)
    val all=store().snapshot();assertEquals("APPROVAL_REQUIRED",all.first{it.getString("id")==queued.getString("id")}.getJSONObject("delivery").getString("reason"))
    assertEquals("synced",all.first{it.getString("id")==a.getString("id")}.getJSONObject("delivery").getString("state"))
  }
}
