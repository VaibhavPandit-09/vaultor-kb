package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Real private journals, checkpoint export and pinned delivery with an inactive source. */
@RunWith(AndroidJUnit4::class)
class R10ConcurrentQueuesTest {
  init { require(android.os.Build.HARDWARE=="ranchu") }
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val ctx get()=i.targetContext
  private val marker get()=File(ctx.cacheDir,"r10-concurrent.json")
  private fun module()=VaultorModule(BridgeReactContext(ctx))
  private fun call(action:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var refused=false;action(PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{refused=true;latch.countDown()}));assertTrue(latch.await(120,TimeUnit.SECONDS));assertFalse("Native operation refused",refused);return value}
  private fun review(m:VaultorModule,id:String)=JSONObject(call{m.reviewCapture("get",JSONObject().put("id",id).toString(),it)})
  private fun exported(m:VaultorModule,id:String):JSONObject {val rows=JSONArray(call{m.companionExports("list","{}",it)});return (0 until rows.length()).map{rows.getJSONObject(it)}.single{it.getString("id")==id}}
  @Test fun offlineQueueThreeDomainsSwitchAndDie() {
    val m=module();val a=JSONObject(File(ctx.cacheDir,"r10-scale.json").readText())
    call{m.companion("activate",a.toString(),it)}
    a.put("epoch",JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch")).put("offline",true)
    val note=JSONObject(call{m.companion("read",JSONObject(a.toString()).put("path","/resources/"+a.getString("noteId")).toString(),it)})
    val input=JSONObject(a.toString()).put("resourceId",note.getString("id")).put("targetTitle",note.getString("title")).put("targetType","note").put("baseRevision",note.getString("revision")).put("quote","").put("context","").put("locator",JSONObject().put("kind","resource"))
    val draft=JSONObject(call{m.reviewCapture("begin",input.toString(),it)});val reviewId=draft.getString("id")
    call{m.reviewCapture("put",JSONObject().put("id",reviewId).put("version",0).put("comment","R10 simultaneous protected Review").toString(),it)}
    val frozen=JSONObject(call{m.reviewCapture("queue",JSONObject().put("id",reviewId).put("version",1).toString(),it)})
    val imports=VaultorImports.get(ctx);val before=imports.rows().map{it.getString("id")}.toSet()
    imports.acquire(UUID.randomUUID().toString(),emptyList(),"R10 simultaneous collected original\r\nExact bytes remain protected.")
    val staged=imports.rows().single{it.getString("id") !in before};val importId=staged.getString("id")
    call{m.collectedImports("confirm",JSONObject(a.toString()).put("id",importId).put("mode","text").put("metered",true).toString(),it)}
    assertEquals("queued",imports.item(importId).getString("state"))
    val export=JSONObject(call{m.companionExports("start",JSONObject(a.toString()).put("request",JSONObject().put("scope","resources").put("format","partial").put("ids",JSONArray(listOf(note.getString("id")))).put("depth",0)).toString(),it)})
    assertEquals("preparing",export.getString("state"));assertEquals("queued",review(m,reviewId).getString("state"));assertEquals("queued",imports.item(importId).getString("state"))
    val second=InstrumentationRegistry.getArguments().getString("secondScope")!!
    call{m.companion("activate",JSONObject().put("scope",second).toString(),it)}
    marker.writeText(JSONObject().put("review",frozen).put("import",imports.item(importId)).put("export",export).put("selected",second).toString())
    android.os.Process.killProcess(android.os.Process.myPid());Thread.sleep(10000);fail("Expected process death")
  }
  @Test fun recoverSameIdentitiesAndDeliverWithSourceInactive() {
    val saved=JSONObject(marker.readText());val m=module();val reviewBefore=saved.getJSONObject("review");val importBefore=saved.getJSONObject("import");val exportBefore=saved.getJSONObject("export")
    assertEquals(reviewBefore.getJSONObject("body").toString(),review(m,reviewBefore.getString("id")).getJSONObject("body").toString())
    val imports=VaultorImports.get(ctx);assertEquals(importBefore.getJSONObject("intent").toString(),imports.item(importBefore.getString("id")).getJSONObject("intent").toString())
    val before=JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch")
    call{m.reviewSync("now","{}",it)};call{m.collectedImports("sync","{\"force\":true}",it)}
    assertEquals("synced",review(m,reviewBefore.getString("id")).getJSONObject("delivery").getString("state"));assertEquals("acknowledged",imports.item(importBefore.getString("id")).getString("state"))
    val id=exportBefore.getString("id");if(exported(m,id).getString("state")!="ready")call{m.companionExports("resume",JSONObject().put("id",id).toString(),it)}
    var ready=false;repeat(300){if(!ready){ready=exported(m,id).getString("state")=="ready";if(!ready)Thread.sleep(100)}};assertTrue(ready)
    assertEquals(exportBefore.getJSONObject("source").toString(),exported(m,id).getJSONObject("source").toString())
    assertEquals(before,JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch"))
    assertEquals(reviewBefore.getJSONObject("body").toString(),review(m,reviewBefore.getString("id")).getJSONObject("body").toString())
  }
}
