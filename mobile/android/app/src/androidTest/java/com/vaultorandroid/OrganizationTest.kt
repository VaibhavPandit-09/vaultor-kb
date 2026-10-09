package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class OrganizationTest {
 private fun result(action:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var failure="";action(PromiseImpl(Callback {args->value=args[0]?.toString() ?: "null";latch.countDown()},Callback {args->failure=args[0]?.toString() ?: "Rejected";latch.countDown()}));assertTrue(latch.await(60,TimeUnit.SECONDS));assertEquals("",failure);return value}
 @Test fun encryptedPendingIdentityAndPolicy() {
  val ctx=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext);val module=VaultorModule(ctx);val file=File(ctx.noBackupFilesDir,"vaultor-state.bin");val previous=if(file.exists())file.readBytes()else null
  val scope="a7-disposable";val id=UUID.randomUUID().toString();val pending=JSONObject().put("scope",scope).put("key","collection:create").put("id",id).put("body",JSONObject().put("name","A7 protected title").put("resourceIds",JSONArray()))
  try {
   result {module.storage("putOrganization",pending.toString(),it)}
   val restarted=VaultorModule(ctx);assertEquals(id,JSONObject(result {restarted.storage("getOrganization",pending.toString(),it)}).getString("id"));assertFalse(file.readBytes().toString(Charsets.UTF_8).contains("A7 protected title"))
   result {restarted.storage("ackOrganization",JSONObject(pending.toString()).put("id",UUID.randomUUID().toString()).toString(),it)};assertNotEquals("null",result {restarted.storage("getOrganization",pending.toString(),it)})
   result {restarted.storage("ackOrganization",pending.toString(),it)};assertEquals("null",result {restarted.storage("getOrganization",pending.toString(),it)})
   val check=VaultorModule::class.java.getDeclaredMethod("organizationPath",String::class.java,String::class.java,String::class.java).apply {isAccessible=true}
   assertEquals(true,check.invoke(module,"/resources/$id/references?direction=incoming&page=1&size=30","GET",null));assertEquals(true,check.invoke(module,"/resources/$id/title","PATCH","\"revision\""));assertEquals(false,check.invoke(module,"/resources/$id/title","PATCH",null));assertEquals(false,check.invoke(module,"/resources/$id","DELETE",null));assertEquals(false,check.invoke(module,"https://example.com/collections","GET",null))
  }finally{if(previous==null)file.delete()else file.writeBytes(previous)}
 }
 @Test fun pairedOrganizationReferencesAndLifecycle() {
  val ctx=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext);val module=VaultorModule(ctx)
  val bootstrap=JSONObject(result {module.storage("bootstrap","{}",it)});val host=bootstrap.getString("selected");val profile=bootstrap.getJSONArray("profiles").let {a->(0 until a.length()).map {a.getJSONObject(it)}.first {it.getString("hostId")==host}}
  require(profile.getString("address").startsWith("https://127.0.0.1:")){"Disposable loopback fixture required"}
  val epoch=JSONObject(result {module.activate(host,it)}).getString("epoch")
  fun raw(path:String,method:String="GET",body:Any?=null,revision:String?=null):JSONObject {
   var reply=JSONObject();for(attempt in 1..5){reply=JSONObject(result {module.apiFor(host,epoch,path,method,body?.toString(),revision,it)});val problem=runCatching {JSONObject(reply.optString("body"))}.getOrNull();if(reply.optInt("status")!=409||problem?.optString("code")!="WORKSPACE_BUSY"||attempt==5)return reply;Thread.sleep(250)};return reply
  }
  fun api(path:String,method:String="GET",body:Any?=null,revision:String?=null):JSONObject {val r=raw(path,method,body,revision);assertTrue("Unexpected HTTP ${r.optInt("status")} at $path: ${r.optString("body").take(600)}",r.getInt("status") in 200..299);return if(r.optString("body").isBlank())JSONObject()else JSONObject(r.getString("body"))}
  fun trashRow(id:String,q:String):JSONObject {val rows=api("/resources/trash?page=0&size=100&q=$q").getJSONArray("items");return (0 until rows.length()).map {rows.getJSONObject(it)}.first {it.getString("id")==id}}
  val note=UUID.randomUUID().toString();val source=UUID.randomUUID().toString();val collection=UUID.randomUUID().toString()
  fun content(target:String?=null):JSONObject {val children=JSONArray().put(JSONObject().put("type","paragraph").put("content",JSONArray().put(JSONObject().put("type","text").put("text","A7 lifecycle fixture"))));if(target!=null)children.put(JSONObject().put("type","paragraph").put("content",JSONArray().put(JSONObject().put("type","resourceLink").put("attrs",JSONObject().put("resourceId",target).put("label","A7 target").put("type","note")))));return JSONObject().put("type","doc").put("content",children)}
  api("/resources/imports/$note","PUT",JSONObject().put("title","A7 original").put("content",content()))
  api("/resources/imports/$source","PUT",JSONObject().put("title","A7 source").put("content",content(note)))
  api("/collections/creations/$collection","PUT",JSONObject().put("name","A7 collection $collection").put("resourceIds",JSONArray().put(note)))
  api("/organization/memberships","POST",JSONObject().put("resourceIds",JSONArray().put(note)).put("kind","collection").put("targetId",collection).put("action","add"))
  val tag=api("/tags","POST",JSONObject().put("name","A7 fixture"));api("/organization/memberships","POST",JSONObject().put("resourceIds",JSONArray().put(note)).put("kind","tag").put("targetId",tag.getString("id")).put("action","add"))
  api("/resources/$note/favorite","PUT",JSONObject().put("favorite",true))
  val first=api("/resources/$note/summary");api("/resources/$note/title","PATCH",JSONObject().put("title","A7 renamed"),"\"${first.getString("revision")}\"")
  assertEquals(412,raw("/resources/$note/title","PATCH",JSONObject().put("title","Stale"),"\"${first.getString("revision")}\"").getInt("status"))
  assertEquals(1,api("/resources/$note/usage").getInt("sources"))
  // File lifecycle must preserve managed-image identity and original bytes on restore.
  val identity=api("/workspace/identity");val scope=JSONArray().put(host).put(identity.getString("id")).put(identity.getString("generation")).toString()
  val imageFile=File(File(ctx.cacheDir,"media-share").apply {mkdirs()},"a7-original.png");val bitmap=android.graphics.Bitmap.createBitmap(48,32,android.graphics.Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.MAGENTA);imageFile.outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
  val media=VaultorModule::class.java.getDeclaredMethod("getMedia").apply {isAccessible=true}.invoke(module);val stage=VaultorMedia::class.java.getDeclaredMethod("stage",android.net.Uri::class.java).apply {isAccessible=true}
  val staged=stage.invoke(media,androidx.core.content.FileProvider.getUriForFile(ctx,ctx.packageName+".media",imageFile)) as JSONObject;val imageId=staged.getString("id")
  val binding=JSONObject().put("scope",scope).put("hostId",host).put("noteId",source).put("anchor","a7-image").put("loadId","fixture")
  result {module.media("bind",JSONObject().put("id",imageId).put("binding",binding).toString(),it)}
  val imageArgs=JSONObject().put("hostId",host).put("epoch",epoch).put("scope",scope).put("id",imageId).put("resourceId",imageId).put("mime","image/png")
  result {module.media("upload",imageArgs.toString(),it)}
  val sourceSummary=api("/resources/$source/summary");val imageContent=content(note);imageContent.getJSONArray("content").put(JSONObject().put("type","image").put("attrs",JSONObject().put("resourceId",imageId).put("alt","A7 original image").put("caption","Placement survives restore").put("width",100).put("alignment","center")))
  api("/resources/$source/note","PUT",JSONObject().put("title","A7 source").put("content",imageContent),"\"${sourceSummary.getString("revision")}\"")
  assertEquals(1,api("/resources/$imageId/usage").getInt("sources"));val imageRefs=api("/resources/$imageId/references?direction=incoming&page=0&size=30");assertEquals(1,imageRefs.getJSONArray("items").getJSONObject(0).getInt("images"))

  val refs=api("/resources/$note/references?direction=incoming&page=0&size=30");assertEquals(source,refs.getJSONArray("items").getJSONObject(0).getString("id"));assertEquals("/1/0",refs.getJSONArray("items").getJSONObject(0).getJSONArray("occurrences").getJSONObject(0).getString("path"))
  fun lifecycle(id:String,action:String,revision:String,operation:String=UUID.randomUUID().toString()):JSONObject {val r=raw("/resources/lifecycle","PUT",JSONArray().put(JSONObject().put("operationId",operation).put("resourceId",id).put("action",action).put("revision",revision)));assertEquals(200,r.getInt("status"));return JSONArray(r.getString("body")).getJSONObject(0)}
  val revision=api("/resources/$note/summary").getString("revision");val operation=UUID.randomUUID().toString();assertEquals("trashed",lifecycle(note,"trash",revision,operation).getString("status"));assertEquals("trashed",lifecycle(note,"trash",revision,operation).getString("status"))
  assertEquals(410,raw("/resources/$note").getInt("status"))
  val trash=trashRow(note,"A7%20renamed");assertEquals(note,trash.getString("id"));assertEquals("restored",lifecycle(note,"restore",trash.getString("revision")).getString("status"))
  assertEquals(note,api("/resources/$note/summary").getString("id"));assertEquals(1,api("/resources/$note/usage").getInt("sources"))

  assertEquals("trashed",lifecycle(imageId,"trash",api("/resources/$imageId/summary").getString("revision")).getString("status"));val imageTrash=trashRow(imageId,"a7-original");assertEquals("restored",lifecycle(imageId,"restore",imageTrash.getString("revision")).getString("status"))
  var preview:JSONObject?=null;for(attempt in 1..3){try{preview=JSONObject(result {module.media("preview",imageArgs.toString(),it)});break}catch(e:org.junit.ComparisonFailure){if(!e.message.orEmpty().contains("(409)")||attempt==3)throw e;Thread.sleep(200)}};assertEquals(48,preview!!.getInt("width"));assertEquals(1,api("/resources/$imageId/usage").getInt("sources"));val digest=java.security.MessageDigest.getInstance("SHA-256").digest((scope+imageId+"raw").toByteArray()).joinToString(""){"%02x".format(it)};assertArrayEquals(imageFile.readBytes(),File(ctx.cacheDir,"media-preview/$digest").readBytes())
  result {module.media("remove",JSONObject().put("id",imageId).toString(),it)};imageFile.delete()
  assertEquals("trashed",lifecycle(imageId,"trash",api("/resources/$imageId/summary").getString("revision")).getString("status"));val imagePurge=trashRow(imageId,"a7-original");assertEquals("purged",lifecycle(imageId,"purge",imagePurge.getString("revision")).getString("status"))
  api("/collections/$collection","DELETE");assertEquals(note,api("/resources/$note/summary").getString("id"))
  val batch=JSONArray().put(JSONObject().put("operationId",UUID.randomUUID().toString()).put("resourceId",note).put("action","trash").put("revision",api("/resources/$note/summary").getString("revision"))).put(JSONObject().put("operationId",UUID.randomUUID().toString()).put("resourceId",source).put("action","trash").put("revision","stale"));val partial=JSONArray(raw("/resources/lifecycle","PUT",batch).getString("body"));assertEquals("trashed",partial.getJSONObject(0).getString("status"));assertEquals("failed",partial.getJSONObject(1).getString("status"));assertEquals(source,api("/resources/$source/summary").getString("id"));assertEquals("restored",lifecycle(note,"restore",trashRow(note,"A7%20renamed").getString("revision")).getString("status"))
  for(id in listOf(note,source)){assertEquals("trashed",lifecycle(id,"trash",api("/resources/$id/summary").getString("revision")).getString("status"));val row=trashRow(id,if(id==note)"A7%20renamed"else"A7%20source");assertEquals("purged",lifecycle(id,"purge",row.getString("revision")).getString("status"))}
 }
}

