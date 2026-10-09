package com.vaultorandroid

import android.graphics.Bitmap
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MediaTest {
  private fun result(action:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var failure="";action(PromiseImpl(Callback {args->value=args[0]?.toString() ?: "null";latch.countDown()},Callback {args->failure=args[0]?.toString() ?: "Rejected";latch.countDown()}));assertTrue(latch.await(60,TimeUnit.SECONDS));assertEquals("",failure);return value}
  private fun png():ByteArray {val b=Bitmap.createBitmap(48,32,Bitmap.Config.ARGB_8888);b.eraseColor(android.graphics.Color.MAGENTA);val out=ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.PNG,100,out);b.recycle();return out.toByteArray()}
  @Test fun boundsFormatsAndFilenameSafety() {
    val info=VaultorMedia.image(png());assertEquals(48,info.getInt("width"));assertEquals(32,info.getInt("height"));assertEquals("image/png",info.getString("mime"))
    assertEquals("_evil_name_.png",VaultorMedia.safeName("../evil/name\n.png"))
    for(bytes in listOf(ByteArray(VaultorMedia.IMAGE_LIMIT+1),"<svg/>".toByteArray()))try{VaultorMedia.image(bytes);fail("Invalid image accepted")}catch(_:IllegalArgumentException){}
    val large=png();java.nio.ByteBuffer.wrap(large,16,8).putInt(8000).putInt(8000);val crc=java.util.zip.CRC32();crc.update(large,12,17);java.nio.ByteBuffer.wrap(large,29,4).putInt(crc.value.toInt())
    try{VaultorMedia.image(large);fail("64 megapixels accepted")}catch(_:IllegalArgumentException){}
  }
  @Test fun encryptedInputRetryAndScopedPreview() {
    // Only an explicitly paired disposable host may be used by this test.
    val ctx=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext);val module=VaultorModule(ctx)
    val bootstrap=JSONObject(result {module.storage("bootstrap","{}",it)});val host=bootstrap.getString("selected");require(host.isNotEmpty())
    val profiles=bootstrap.getJSONArray("profiles");val profile=(0 until profiles.length()).map {profiles.getJSONObject(it)}.first {it.getString("hostId")==host};require(profile.getString("address").startsWith("https://127.0.0.1:"))
    val activated=JSONObject(result {module.activate(host,it)});val identityResponse=JSONObject(result {module.apiFor(host,activated.getString("epoch"),"/workspace/identity","GET",null,null,it)});val identity=JSONObject(identityResponse.getString("body"))
    val scope=JSONArray().put(host).put(identity.getString("id")).put(identity.getString("generation")).toString();val session=bootstrap.getJSONObject("sessions").optJSONObject(scope);val note=session?.optString("noteId") ?: error("Open the disposable fixture note first")
    val args=JSONObject().put("hostId",host).put("epoch",activated.getString("epoch")).put("scope",scope)
    val dir=File(ctx.noBackupFilesDir,"media-inputs").apply {mkdirs()};val catalog=File(dir,"catalog.bin");val before=if(catalog.exists())catalog.readBytes()else null
    val source=File(File(ctx.cacheDir,"media-share").apply {mkdirs()},"a4-fixture.png").apply {writeBytes(png())};var id="";val otherIds=ArrayList<String>();val otherFiles=ArrayList<File>()
    try {
      val media=VaultorModule::class.java.getDeclaredMethod("getMedia").apply {isAccessible=true}.invoke(module)
      val stage=VaultorMedia::class.java.getDeclaredMethod("stage",Uri::class.java).apply {isAccessible=true}
      val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",source);val input=stage.invoke(media,uri) as JSONObject;id=input.getString("id")
      assertFalse(catalog.readBytes().toString(Charsets.UTF_8).contains("a4-fixture.png"));assertFalse(File(dir,"$id.bin").readBytes().contentEquals(source.readBytes()))
      val restarted=VaultorModule(BridgeReactContext(ctx));val restored=JSONArray(result {restarted.media("list","{}",it)});assertTrue((0 until restored.length()).any {restored.getJSONObject(it).getString("id")==id})
      result {module.media("bind",JSONObject().put("id",id).put("binding",JSONObject().put("scope",scope).put("hostId",host).put("noteId",note).put("anchor","native-fixture").put("loadId","test")).toString(),it)}
      val upload=args.put("id",id)
      assertEquals(id,JSONObject(result {module.media("upload",upload.toString(),it)}).getString("resourceId"))
      // Simulate losing the local acknowledgement after the host committed the import.
      val records=VaultorMedia::class.java.getDeclaredMethod("records").apply {isAccessible=true}.invoke(media) as JSONObject;records.getJSONObject(id).remove("resourceId");VaultorMedia::class.java.getDeclaredMethod("persist",JSONObject::class.java).apply {isAccessible=true}.invoke(media,records)
      assertEquals(id,JSONObject(result {module.media("upload",upload.toString(),it)}).getString("resourceId"))
      val preview=args.put("resourceId",id).put("mime","image/png")
      assertEquals(48,JSONObject(result {module.media("preview",preview.toString(),it)}).getInt("width"))
      val thumb=JSONObject(result {module.media("thumbnail",preview.toString(),it)}).getString("data");assertTrue(thumb.startsWith("data:image/png;base64,"));assertTrue(thumb.length<530000)
      val digest=java.security.MessageDigest.getInstance("SHA-256").digest((scope+id+"raw").toByteArray()).joinToString(""){"%02x".format(it)}
      assertArrayEquals(source.readBytes(),File(ctx.cacheDir,"media-preview/$digest").readBytes())
      result {module.media("remove",JSONObject().put("id",id).toString(),it)};assertFalse(File(dir,"$id.bin").exists())
      val detail=JSONObject(result {module.apiFor(host,activated.getString("epoch"),"/resources/$id/summary","GET",null,null,it)});assertEquals(200,detail.getInt("status"))
      // Actual Android PDF rendering and bounded text preview use the same native adapter.
      val pdfFile=File(source.parentFile,"a4-preview.pdf");otherFiles.add(pdfFile)
      val pdf=android.graphics.pdf.PdfDocument();try {for(pageNumber in 1..2){val page=pdf.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(200,300,pageNumber).create());page.canvas.drawColor(android.graphics.Color.CYAN);pdf.finishPage(page)};pdfFile.outputStream().use {pdf.writeTo(it)}}finally{pdf.close()}
      val textFile=File(source.parentFile,"a4-preview.txt").apply {writeText("T".repeat(120000))};otherFiles.add(textFile)
      for((file,mime) in listOf(pdfFile to "application/pdf",textFile to "text/plain")) {
        val staged=stage.invoke(media,FileProvider.getUriForFile(ctx,ctx.packageName+".media",file)) as JSONObject;val fileId=staged.getString("id");otherIds.add(fileId)
        result {module.media("bind",JSONObject().put("id",fileId).put("binding",JSONObject().put("scope",scope).put("hostId",host).put("noteId",note).put("anchor","preview-fixture").put("loadId","test")).toString(),it)}
        result {module.media("upload",JSONObject(args.toString()).put("id",fileId).toString(),it)}
        val shown=JSONObject(result {module.media("preview",JSONObject(args.toString()).put("resourceId",fileId).put("mime",mime).put("page",1).toString(),it)})
        if(mime=="application/pdf"){assertEquals(2,shown.getInt("pages"));assertEquals(1,shown.getInt("page"));assertTrue(File(Uri.parse(shown.getString("uri")).path!!).exists())}
        else {assertEquals(100000,shown.getString("text").length);assertTrue(shown.getBoolean("limited"))}
      }
    }finally{if(before!=null)catalog.writeBytes(before)else catalog.delete();if(id.isNotEmpty())File(dir,"$id.bin").delete();otherIds.forEach {File(dir,"$it.bin").delete()};otherFiles.forEach {it.delete()};source.delete()}
  }
}
