package com.vaultorandroid
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import javax.crypto.spec.SecretKeySpec
@RunWith(AndroidJUnit4::class)
class ReviewStoreTest {
  init {require(android.os.Build.HARDWARE=="ranchu")}
  private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
  private fun seed()=JSONObject().put("scope",JSONArray(listOf("00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","generation")).toString()).put("resourceId","00000000-0000-4000-8000-000000000003").put("targetTitle","Original").put("targetType","note").put("baseRevision","original-revision").put("quote","saved evidence").put("context","saved evidence context").put("locator",JSONObject().put("kind","block").put("path","0.1"))
  private fun refused(block:()->Unit){try{block();fail("Expected refusal")}catch(e:IllegalArgumentException){}}
  private fun fixture(block:(VaultorReviews,File,()->VaultorReviews)->Unit){
    val file=File(ctx.cacheDir,"review-store-"+java.util.UUID.randomUUID()+".bin")
    val key=SecretKeySpec(ByteArray(32){it.toByte()},"AES")
    fun store()=VaultorReviews(file){key}
    try{block(store(),file,::store)}finally{file.delete();File(file.path+".bak").delete();File(file.path+".new").delete()}
  }
  @Test fun durableFrozenQueueAndStaleEditRefusal()=fixture {store,file,reopen->
    val draft=JSONObject(store.execute("begin",seed()));val id=draft.getString("id")
    refused{store.execute("queue",JSONObject().put("id",id).put("version",0))}
    val put=JSONObject().put("id",id).put("version",0).put("comment","Check this discrepancy")
    store.execute("put",put);refused{store.execute("put",put)}
    val queued=store.execute("queue",JSONObject().put("id",id).put("version",1))
    assertEquals(queued,reopen().execute("queue",JSONObject().put("id",id).put("version",1)))
    assertEquals(queued,JSONArray(reopen().execute("list",JSONObject())).getJSONObject(0).toString())
    assertEquals("original-revision",JSONObject(queued).getJSONObject("body").getString("baseRevision"))
    refused{store.execute("put",JSONObject().put("id",id).put("version",2).put("comment","different intent"))}
    assertFalse(file.readText(Charsets.ISO_8859_1).contains("Check this discrepancy"))
  }
  @Test fun invalidEvidenceAndLimitsRetainDraft()=fixture {store,_,reopen->
    refused{store.execute("begin",seed().put("quote","x".repeat(4001)))}
    refused{store.execute("begin",seed().put("locator",JSONObject().put("kind","page").put("page",0)))}
    val draft=JSONObject(store.execute("begin",seed()));refused{store.execute("put",JSONObject().put("id",draft.getString("id")).put("version",0).put("comment","x".repeat(5001)))}
    assertEquals("",JSONArray(reopen().execute("list",JSONObject())).getJSONObject(0).getJSONObject("body").getString("comment"))
  }
  @Test fun corruptionNeverResetsRetainedBytes()=fixture {store,file,reopen->
    store.execute("begin",seed());val bytes=file.readBytes();bytes[bytes.lastIndex]=(bytes.last().toInt() xor 1).toByte();file.writeBytes(bytes)
    try{reopen().execute("list",JSONObject());fail("Corruption must fail closed")}catch(_:javax.crypto.AEADBadTagException){}
    assertArrayEquals(bytes,file.readBytes())
  }
  @Test fun failedAtomicWriteRetainsLastProtectedDraft()=fixture {store,file,reopen->
    val draft=JSONObject(store.execute("begin",seed()));val bytes=file.readBytes();val blocked=File(file.path+".new");assertTrue(blocked.mkdir());val guard=File(blocked,"guard");guard.writeText("disposable fault")
    try{store.execute("put",JSONObject().put("id",draft.getString("id")).put("version",0).put("comment","must not claim success"));fail("Expected local storage failure")}catch(_:java.io.IOException){}finally{guard.delete();blocked.delete()}
    assertArrayEquals(bytes,file.readBytes());assertEquals("",JSONArray(reopen().execute("list",JSONObject())).getJSONObject(0).getJSONObject("body").getString("comment"))
  }
}
