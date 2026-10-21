package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.spec.SecretKeySpec

@RunWith(AndroidJUnit4::class)
class ReviewSyncTest {
  init {require(android.os.Build.HARDWARE=="ranchu")}
  private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
  private val host="00000000-0000-4000-8000-000000000001"
  private val workspace="00000000-0000-4000-8000-000000000002"
  private val resource="00000000-0000-4000-8000-000000000003"
  private fun seed(h:String=host)=JSONObject().put("scope",JSONArray(listOf(h,workspace,"generation")).toString()).put("resourceId",resource).put("targetTitle","Synthetic review target").put("targetType","note").put("baseRevision","frozen-original-revision").put("quote","saved quote").put("context","saved context").put("locator",JSONObject().put("kind","resource"))
  private fun queue(store:VaultorReviews,h:String=host):JSONObject {
    val draft=JSONObject(store.execute("begin",seed(h)));val id=draft.getString("id")
    store.execute("put",JSONObject().put("id",id).put("version",0).put("comment","Synthetic concern"))
    return JSONObject(store.execute("queue",JSONObject().put("id",id).put("version",1)))
  }
  private fun fixture(block:(VaultorReviews,()->VaultorReviews,File)->Unit) {
    val file=File(ctx.cacheDir,"r6-sync-${UUID.randomUUID()}.bin");val key=SecretKeySpec(ByteArray(32){it.toByte()},"AES")
    fun open()=VaultorReviews(file){key}
    try {block(open(),::open,file)} finally {file.delete();File(file.path+".bak").delete();File(file.path+".new").delete()}
  }
  private inner class Host:VaultorReviewSync.Port {
    var available=true;var revoked=false;var generation="generation";var loseAck=false;var invalidReceipt=false;var conflict=false
    var puts=0;var gets=0;val rows=mutableMapOf<String,JSONObject>();val bodies=mutableListOf<String>()
    override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
      assertEquals("The captured workspace is the route",workspace,source.getString("workspaceId"))
      if(!available)throw SocketTimeoutException("Synthetic offline")
      if(revoked)return response(403,JSONObject())
      val value=when(path) {
        "/access/host"->JSONObject().put("hostId",source.getString("hostId"))
        "/workspace/identity"->JSONObject().put("id",workspace).put("generation",generation)
        "/capabilities"->JSONObject().put("reviews",1)
        else->{
          val id=path.substringAfterLast('/')
          if(method=="PUT") {
            puts++;bodies.add(body!!)
            if(conflict)return response(409,JSONObject().put("code","REVIEW_ID_REUSED"))
            val parsed=JSONObject(body)
            rows.getOrPut(id){JSONObject(body).removeCreationInputs().put("id",id).put("status","open").put("revision","host-review-r1").put("author","Authenticated fixture").put("createdAt","2026-10-21T00:00:00Z").put("updatedAt","2026-10-21T00:00:00Z")}
            assertEquals("No base revision may be replaced by a GET receipt", "frozen-original-revision",parsed.getString("baseRevision"))
            if(loseAck){loseAck=false;throw SocketTimeoutException("Synthetic lost acknowledgment after commit")}
          } else gets++
          if(invalidReceipt)JSONObject().put("id",UUID.randomUUID().toString()) else rows[id] ?: return response(404,JSONObject().put("code","REVIEW_NOT_FOUND"))
        }
      }
      return response(200,value)
    }
    private fun JSONObject.removeCreationInputs():JSONObject {remove("generation");remove("baseRevision");return this}
    private fun response(status:Int,value:JSONObject)=JSONObject().put("status",status).put("body",value.toString())
  }
  @Test fun offlineLostAckRestartExactRetryAndDesktopStatus()=fixture {store,reopen,_->
    val frozen=queue(store);val body=frozen.getJSONObject("body").toString();val server=Host();server.available=false
    VaultorReviewSync(store,server).sync(true)
    assertEquals("queued",reopen().snapshot().first().getJSONObject("delivery").getString("state"));assertEquals(0,server.puts)
    server.available=true;server.loseAck=true
    VaultorReviewSync(reopen(),server).sync(true)
    assertEquals("unknown",reopen().snapshot().first().getJSONObject("delivery").getString("state"));assertEquals(1,server.rows.size)
    val id=frozen.getString("id");server.rows[id]!!.put("status","resolved").put("revision","r2")
    VaultorReviewSync(reopen(),server).sync(true)
    val synced=reopen().snapshot().first()
    assertEquals("synced",synced.getJSONObject("delivery").getString("state"));assertEquals("resolved",synced.getJSONObject("delivery").getJSONObject("receipt").getString("status"))
    assertEquals(1,server.rows.size);assertEquals(server.bodies[0],server.bodies[1]);assertEquals(body,synced.getJSONObject("body").toString())
    server.rows[id]!!.put("status","dismissed").put("revision","r3")
    VaultorReviewSync(reopen(),server).sync(refresh=true)
    assertEquals("dismissed",reopen().snapshot().first().getJSONObject("delivery").getJSONObject("receipt").getString("status"));assertEquals(2,server.puts)
    server.available=false;VaultorReviewSync(reopen(),server).sync(true)
    assertEquals("synced",reopen().snapshot().first().getJSONObject("delivery").getString("state"));assertEquals("dismissed",reopen().snapshot().first().getJSONObject("delivery").getJSONObject("receipt").getString("status"))
  }
  @Test fun wrongGenerationRevocationConflictAndMalformedReceiptRetainEvidence()=fixture {store,reopen,_->
    val frozen=queue(store);val body=frozen.getJSONObject("body").toString();val server=Host();server.generation="replacement"
    VaultorReviewSync(store,server).sync(true)
    assertEquals(0,server.puts);assertEquals("REVIEW_GENERATION_CHANGED",store.snapshot().first().getJSONObject("delivery").getString("reason"))
    server.generation="generation";server.revoked=true;VaultorReviewSync(reopen(),server).sync(true)
    assertEquals(0,server.puts);assertEquals("APPROVAL_REQUIRED",store.snapshot().first().getJSONObject("delivery").getString("reason"))
    server.revoked=false;server.conflict=true;VaultorReviewSync(reopen(),server).sync(true)
    assertEquals("REVIEW_ID_REUSED",store.snapshot().first().getJSONObject("delivery").getString("reason"))
    server.conflict=false;server.invalidReceipt=true;VaultorReviewSync(reopen(),server).sync(true)
    assertEquals("error",store.snapshot().first().getJSONObject("delivery").getString("state"));assertEquals(body,store.snapshot().first().getJSONObject("body").toString())
  }
  @Test fun oneNativeOwnerAndPersistBeforeDispatch()=fixture {store,_,file->
    queue(store);val server=Host();val entered=CountDownLatch(1);val release=CountDownLatch(1)
    val blocked=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return server.request(source,path,method,body)}
    }
    val thread=Thread {VaultorReviewSync(store,blocked).sync(true)};thread.start();assertTrue(entered.await(5,TimeUnit.SECONDS))
    assertTrue(VaultorReviewSync(store,server).sync(true).getBoolean("busy"));release.countDown();thread.join(10000);assertFalse(thread.isAlive);assertEquals(1,server.puts)
    val next=queue(store);val fault=File(file.path+".new");assertTrue(fault.mkdir());val guard=File(fault,"guard");guard.writeText("fault")
    val before=server.puts
    try{VaultorReviewSync(store,server).sync(true);fail("Claim persistence must fail before PUT")}catch(_:Exception){}finally{guard.delete();fault.delete()}
    assertEquals(before,server.puts);assertEquals("queued",store.snapshot().first{it.getString("id")==next.getString("id")}.getString("state"))
  }
  @Test fun generationReplacementDuringGetCannotReplaceKnownReceipt()=fixture {store,reopen,_->
    queue(store);val server=Host();VaultorReviewSync(store,server).sync(true)
    server.rows.values.first().put("status","resolved").put("revision","replacement-r2")
    val race=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
        val result=server.request(source,path,method,body)
        if(path.startsWith("/reviews/"))server.generation="replacement"
        return result
      }
    }
    VaultorReviewSync(reopen(),race).sync(true)
    val d=reopen().snapshot().first().getJSONObject("delivery")
    assertEquals("synced",d.getString("state"));assertEquals("REVIEW_GENERATION_CHANGED",d.getString("reason"));assertEquals("open",d.getJSONObject("receipt").getString("status"));assertEquals(1,server.puts)
  }
  @Test fun receiptPersistenceFailureRetainsClaimAndExactIdentity()=fixture {store,reopen,file->
    val frozen=queue(store);val server=Host();val fault=File(file.path+".new");val guard=File(fault,"guard")
    val failReceipt=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
        val response=server.request(source,path,method,body)
        if(method=="PUT"){assertTrue(fault.mkdir());guard.writeText("fault")}
        return response
      }
    }
    try {VaultorReviewSync(store,failReceipt).sync(true);fail("Receipt must be persisted before success")}catch(_:java.io.IOException){}finally{guard.delete();fault.delete()}
    assertEquals("sending",reopen().snapshot().first().getJSONObject("delivery").getString("state"))
    VaultorReviewSync(reopen(),server).sync(true)
    assertEquals(1,server.rows.size);assertEquals(server.bodies[0],server.bodies[1]);assertEquals(frozen.getJSONObject("body").toString(),reopen().snapshot().first().getJSONObject("body").toString())
    assertEquals("synced",reopen().snapshot().first().getJSONObject("delivery").getString("state"))
  }
  @Test fun staleSendingAndMixedSourceFailuresAreRecoverable()=fixture {store,reopen,_->
    val old=queue(store);val id=old.getString("id");store.delivery(id,JSONObject().put("state","sending").put("attempted",true))
    val other="00000000-0000-4000-8000-000000000004";queue(store,other);val server=Host()
    val mixed=object:VaultorReviewSync.Port {
      override fun request(source:JSONObject,path:String,method:String,body:String?):JSONObject {
        if(source.getString("hostId")==other)throw VaultorReviewSync.Failure("APPROVAL_REQUIRED")
        return server.request(source,path,method,body)
      }
    }
    VaultorReviewSync(reopen(),mixed).sync(true)
    assertEquals(1,server.rows.size);assertTrue(store.snapshot().any{it.getJSONObject("delivery").getString("state")=="synced"});assertTrue(store.snapshot().any{it.getJSONObject("delivery").getString("reason")=="APPROVAL_REQUIRED"})
  }
}
