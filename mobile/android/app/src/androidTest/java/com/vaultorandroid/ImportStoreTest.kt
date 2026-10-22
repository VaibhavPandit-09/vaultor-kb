package com.vaultorandroid
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.core.content.FileProvider
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.*
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class ImportStoreTest {
  init{require(android.os.Build.HARDWARE=="ranchu")}
  private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
  private val source get()=JSONObject().put("hostId",UUID.randomUUID().toString()).put("workspaceId",UUID.randomUUID().toString()).put("generation",UUID.randomUUID().toString()).put("label","Disposable source")
  private fun fixture(test:(VaultorImports,File)->Unit){val root=File(ctx.cacheDir,"import-fixture-"+UUID.randomUUID());val store=VaultorImports.fixture(ctx,root);try{test(store,root)}finally{try{store.closeFixture()}catch(_:Exception){};require(root.canonicalPath.startsWith(ctx.cacheDir.canonicalPath+File.separator));root.deleteRecursively()}}
  private fun collect(store:VaultorImports,text:String="Exact imported original\r\n"):JSONObject {store.acquire(UUID.randomUUID().toString(),emptyList(),text);return store.rows().last()}
  private fun queued(store:VaultorImports):JSONObject {val row=collect(store);return store.confirm(row.getString("id"),source,"text",null,null,false)}
  private fun exactReceipt(row:JSONObject):JSONObject{val i=row.getJSONObject("intent");val canonical=listOf("generation","filename","mime","sha256","bytes","mode","collectionId").joinToString("\u0000"){if(i.isNull(it))"" else i.get(it).toString()};val fingerprint=java.security.MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray()).joinToString(""){"%02x".format(it)};return JSONObject().put("version",1).put("id",row.getString("id")).put("resourceId",row.getString("id")).put("workspaceId",row.getJSONObject("source").getString("workspaceId")).put("generation",i.getString("generation")).put("sha256",i.getString("sha256")).put("filename",i.getString("filename")).put("bytes",i.getLong("bytes")).put("collectionId",JSONObject.NULL).put("kind","note").put("fingerprint",fingerprint)}
  @Test fun collectedWithoutDestinationRetainsEncryptedOriginalAndDuplicateIntentIsIgnored()=fixture {store,root->
    val token=UUID.randomUUID().toString();val text="No destination private import";store.acquire(token,emptyList(),text);store.acquire(token,emptyList(),text);val row=store.rows().single();assertEquals("collected",row.getString("state"));assertFalse(row.has("source"));assertFalse(row.has("intent"));val bytes=java.io.ByteArrayOutputStream();store.original(row){bytes.write(it)};assertArrayEquals(text.toByteArray(),bytes.toByteArray());assertFalse(File(root,row.getString("id")+".bin").readText(Charsets.ISO_8859_1).contains(text));assertFalse(File(root,"queue.sqlite").readText(Charsets.ISO_8859_1).contains(text))
  }
  @Test fun originalSurvivesProviderDeletionAndBatchFailureIsPerItem()=fixture {store,_->
    val share=File(ctx.cacheDir,"media-share").apply {mkdirs()};val good=File(share,"import-"+UUID.randomUUID()+".txt");good.writeBytes("Provider exact\r\nbytes".toByteArray());val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",good)
    val absent=FileProvider.getUriForFile(ctx,ctx.packageName+".media",File(share,"absent-"+UUID.randomUUID()+".txt"));store.acquire(UUID.randomUUID().toString(),listOf(uri to null,absent to null),null);good.delete();val rows=store.rows();assertEquals(2,rows.size);assertEquals("collected",rows[0].getString("state"));assertEquals("acquisitionInterrupted",rows[1].getString("state"));val out=java.io.ByteArrayOutputStream();store.original(rows[0]){out.write(it)};assertEquals("Provider exact\r\nbytes",out.toString("UTF-8"))
  }
  @Test fun stagingQuotaAndCountNeverEvictPriorInput()=fixture {store,root->
    val row=collect(store);store.policy(JSONObject().put("budgetMiB",64).put("metered",false));val occupied=File(root,"quota.bin");java.io.RandomAccessFile(occupied,"rw").use {it.setLength(64L*1024*1024)};collect(store,"rejected");assertEquals("acquisitionInterrupted",store.rows().last().getString("state"));store.original(row){};occupied.delete()
    while(store.rows().size<128)store.save(JSONObject().put("id",UUID.randomUUID().toString()).put("bytes",0).put("state","cancelled"))
    try{store.acquire(UUID.randomUUID().toString(),emptyList(),"over-count");fail("Expected count refusal")}catch(_:IllegalArgumentException){};assertEquals(128,store.rows().size);store.original(row){}
  }
  @Test fun interruptedAcquisitionAndSendingClaimSurviveReopen()=fixture {store,root->
    val queued=queued(store);val id=queued.getString("id");val claim=store.claim(id);val body=claim.getJSONObject("intent").toString();val interrupted=UUID.randomUUID().toString();store.save(JSONObject().put("id",interrupted).put("bytes",0).put("state","acquiring"));val reopened=VaultorImports.fixture(ctx,root)
    try{assertEquals("acquisitionInterrupted",reopened.item(interrupted).getString("state"));assertEquals("sending",reopened.item(id).getString("state"));assertEquals(body,reopened.item(id).getJSONObject("intent").toString());reopened.original(reopened.item(id)){};try{reopened.remove(id);fail("Uncertain removal refused")}catch(_:IllegalArgumentException){}}finally{reopened.closeFixture()}
  }
  @Test fun lostAcknowledgmentUsesExactOperationThenPersistsReceipt()=fixture {store,_->
    val row=queued(store);var calls=0;val bodies=ArrayList<String>();val delivery=VaultorImportDelivery(store,object:VaultorImportDelivery.Port{override fun admit(row:JSONObject){};override fun request(row:JSONObject,path:String,upload:Boolean):JSONObject{assertTrue(upload);calls++;bodies.add(row.getJSONObject("intent").toString());if(calls==1)throw java.io.IOException("Committed response lost");return JSONObject().put("status",200).put("body",exactReceipt(row).toString())}})
    delivery.sync(true);assertEquals("unknown",store.item(row.getString("id")).getString("state"));delivery.sync(true);assertEquals(2,calls);assertEquals(bodies[0],bodies[1]);assertEquals("acknowledged",store.item(row.getString("id")).getString("state"));delivery.sync(true);assertEquals(2,calls)
  }
  @Test fun receiptMismatchRevocationAndGenerationNeverAcknowledgeOrRedirect()=fixture {store,_->
    val row=queued(store);val frozen=row.getJSONObject("source").toString();var refusal="IMPORT_GENERATION_CHANGED";var send=false
    val delivery=VaultorImportDelivery(store,object:VaultorImportDelivery.Port{override fun admit(row:JSONObject){if(!send)throw VaultorImportDelivery.Refusal(refusal)};override fun request(row:JSONObject,path:String,upload:Boolean)=JSONObject().put("status",200).put("body",exactReceipt(row).put("sha256","0".repeat(64)).toString())})
    delivery.sync(true);assertEquals("needsAttention",store.item(row.getString("id")).getString("state"));assertFalse(store.item(row.getString("id")).has("receipt"));store.retry(row.getString("id"),false);refusal="APPROVAL_REQUIRED";delivery.sync(true);assertEquals(frozen,store.item(row.getString("id")).getJSONObject("source").toString());store.retry(row.getString("id"),false);send=true;delivery.sync(true);assertFalse(store.item(row.getString("id")).has("receipt"));assertEquals("needsAttention",store.item(row.getString("id")).getString("state"))
  }
  @Test fun corruptOriginalAndStoppedUncertaintyCannotBeRemovedOrSent()=fixture {store,root->
    val row=queued(store);val id=row.getString("id");store.claim(id);store.stop(id);try{store.remove(id);fail("Uncertain bytes cannot disappear")}catch(_:IllegalArgumentException){};store.retry(id,false);val path=File(root,"$id.bin");val bytes=path.readBytes();bytes[bytes.lastIndex-4]=(bytes[bytes.lastIndex-4].toInt() xor 1).toByte();path.writeBytes(bytes);var sent=false;val delivery=VaultorImportDelivery(store,object:VaultorImportDelivery.Port{override fun admit(row:JSONObject){};override fun request(row:JSONObject,path:String,upload:Boolean):JSONObject{sent=true;error("Corrupt original must not dispatch")}});delivery.sync(true);assertFalse(sent);assertFalse(store.item(id).has("receipt"));assertTrue(path.exists())
  }
  @Test fun onlyDurableRefusalPermitsNewUnassignedOperationWithExactOriginal()=fixture {store,_->
    val row=queued(store);val id=row.getString("id");store.claim(id);store.outcome(id,"unknown","Response lost");try{store.newAfterRejection(id);fail("Unknown outcome cannot fork")}catch(_:IllegalArgumentException){}
    store.rejection(id,"IMPORT_COLLECTION_UNAVAILABLE");store.outcome(id,"needsAttention","Collection removed");val next=store.newAfterRejection(id);assertNotEquals(id,next.getString("id"));assertEquals("collected",next.getString("state"));assertFalse(next.has("source"));assertFalse(next.has("intent"));assertEquals(row.getString("sha256"),next.getString("sha256"));val oldBytes=java.io.ByteArrayOutputStream();store.original(row){oldBytes.write(it)};val newBytes=java.io.ByteArrayOutputStream();store.original(next){newBytes.write(it)};assertArrayEquals(oldBytes.toByteArray(),newBytes.toByteArray());assertEquals(id,next.getString("previousRejectedOperation"));store.remove(id);store.original(next){}
  }
  @Test fun zipWaitsForExactOwnerSuccessWithoutClaimingResourceEarly()=fixture {store,_->
    val collected=collect(store,"Private archive bytes");val row=store.confirm(collected.getString("id"),source,"workspaceZip",null,"Owner chosen new workspace",false);var state="AWAITING_OWNER";var uploads=0
    val delivery=VaultorImportDelivery(store,object:VaultorImportDelivery.Port{override fun admit(row:JSONObject){};override fun request(row:JSONObject,path:String,upload:Boolean):JSONObject{if(upload)uploads++;val receipt=JSONObject().put("version",1).put("id",row.getString("id")).put("input",row.getJSONObject("intent")).put("state",state);if(state=="SUCCEEDED")receipt.put("destinationWorkspaceId",row.getString("id"));return JSONObject().put("status",200).put("body",receipt.toString())}})
    delivery.sync(true);assertEquals("waitingOwner",store.item(row.getString("id")).getString("state"));assertFalse(store.item(row.getString("id")).has("receipt"));state="PREVIEWED";delivery.sync(true);assertFalse(store.item(row.getString("id")).has("receipt"));state="SUCCEEDED";delivery.sync(true);assertEquals("acknowledged",store.item(row.getString("id")).getString("state"));assertEquals(1,uploads)
  }

  @Test fun deviceFreeSpaceReserveAndPerItemLimitFailWithoutLosingEarlierOriginal()=fixture {store,root->
    val protected=collect(store);val unavailable=VaultorImports.fixture(ctx,object:File(root.path){override fun getUsableSpace()=0L});try{collect(unavailable,"disk unavailable");assertEquals("acquisitionInterrupted",unavailable.rows().last().getString("state"));assertFalse(unavailable.rows().last().has("sha256"));unavailable.original(protected){}}finally{unavailable.closeFixture()}
    val share=File(ctx.cacheDir,"media-share").apply {mkdirs()};val oversized=File(share,"oversized-"+UUID.randomUUID()+".bin");try{java.io.RandomAccessFile(oversized,"rw").use {it.setLength(VaultorImports.ITEM+1)};val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",oversized);store.acquire(UUID.randomUUID().toString(),listOf(uri to null),null);assertEquals("acquisitionInterrupted",store.rows().last().getString("state"));assertTrue(store.rows().last().getString("detail").contains("64 MiB"));store.original(protected){};val count=store.rows().size;try{store.acquire(UUID.randomUUID().toString(),List(9){uri to null},null);fail("Nine inputs refused before acquisition")}catch(_:IllegalArgumentException){};assertEquals(count,store.rows().size)}finally{oversized.delete()}
  }

}
