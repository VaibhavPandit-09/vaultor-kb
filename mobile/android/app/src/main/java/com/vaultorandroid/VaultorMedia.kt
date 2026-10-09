package com.vaultorandroid

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.AtomicFile
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/** Bounded private media store. Only opaque handles cross the bridge; credentials remain in VaultorModule. */
class VaultorMedia(private val ctx:ReactApplicationContext,
  private val seal:(ByteArray)->ByteArray, private val unseal:(ByteArray)->ByteArray,
  private val connection:(JSONObject,String,String)->HttpsURLConnection,
  private val valid:(JSONObject)->Unit) : BaseActivityEventListener() {
  companion object {
    const val IMAGE_LIMIT=20*1024*1024
    const val FILE_LIMIT=64*1024*1024
    const val PIXEL_LIMIT=40000000L
    fun safeName(input:String)=input.replace(Regex("[\\\\/\\p{Cntrl}:*?\"<>|]"),"_").trim().trim('.').take(180).ifEmpty {"attachment"}
    fun image(bytes:ByteArray):JSONObject {
      require(bytes.size<=IMAGE_LIMIT) {"Images must be at most 20 MiB."}
      val o=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,o)
      require(o.outMimeType in listOf("image/png","image/jpeg","image/webp","image/gif")) {"Inline images support PNG, JPEG, WebP and GIF. Use File import for other formats."}
      require(o.outWidth>0 && o.outHeight>0 && o.outWidth.toLong()*o.outHeight<=PIXEL_LIMIT) {"Images must be at most 40 megapixels."}
      return JSONObject().put("width",o.outWidth).put("height",o.outHeight).put("mime",o.outMimeType)
    }
  }
  private val worker=Executors.newSingleThreadExecutor()
  private val lock=Any()
  private val root=File(ctx.noBackupFilesDir,"media-inputs").apply {mkdirs()}
  private val cache=File(ctx.cacheDir,"media-preview").apply {mkdirs()}
  private val shares=File(ctx.cacheDir,"media-share").apply {mkdirs()}
  private val catalog=AtomicFile(File(root,"catalog.bin"))
  private var pending:Promise?=null
  private var pendingAction=""
  private var camera:File?=null
  private var outgoing:File?=null
  private var cold=false
  private val active=java.util.concurrent.ConcurrentHashMap.newKeySet<HttpsURLConnection>()
  init {ctx.addActivityEventListener(this)}
  private fun records():JSONObject = if(catalog.baseFile.exists())JSONObject(String(unseal(catalog.readFully()),Charsets.UTF_8))else JSONObject()
  private fun persist(r:JSONObject) {val out=catalog.startWrite();try {out.write(seal(r.toString().toByteArray()));catalog.finishWrite(out)}catch(e:Exception){catalog.failWrite(out);throw e}}
  private fun emit() {if(ctx.hasActiveReactInstance())ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("VaultorMediaInputs","changed")}
  private fun stage(uri:Uri):JSONObject = synchronized(lock) {
    require(uri.scheme=="content") {"Only temporary content-provider files are accepted."}
    val r=records();require(r.length()<8) {"Eight pending inputs reached. Insert or remove an input first."}
    var title="attachment";ctx.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {if(it.moveToFirst())title=it.getString(0) ?: title}
    val bytes=ctx.contentResolver.openInputStream(uri)?.use {it.readNBytes(FILE_LIMIT+1)} ?: error("Cannot read the selected file.")
    require(bytes.isNotEmpty() && bytes.size<=FILE_LIMIT) {"Files must be at most 64 MiB."}
    var total=bytes.size.toLong();r.keys().forEach {total+=r.getJSONObject(it).getLong("bytes")};require(total<=80L*1024*1024) {"Pending inputs exceed 80 MiB. Resolve an input first."}
    val mime=(ctx.contentResolver.getType(uri) ?: "application/octet-stream").lowercase();require(mime.matches(Regex("[a-z0-9.+-]+/[a-z0-9.+-]+"))) {"Invalid file format metadata."}
    val inline=mime in listOf("image/png","image/jpeg","image/webp","image/gif")
    val info=if(inline)image(bytes)else JSONObject().put("mime",mime)
    val id=UUID.randomUUID().toString();val f=File(root,"$id.bin");f.writeBytes(seal(bytes))
    val item=info.put("id",id).put("title",safeName(title)).put("bytes",bytes.size).put("image",inline)
    r.put(id,item);try {persist(r)}catch(e:Exception){f.delete();throw e};JSONObject(item.toString())
  }
  private fun inputs(data:Intent):List<Uri> {
    val list=ArrayList<Uri>()
    if(data.action==Intent.ACTION_SEND_MULTIPLE)data.getParcelableArrayListExtra(Intent.EXTRA_STREAM,Uri::class.java)?.let {list.addAll(it)}
    else data.getParcelableExtra(Intent.EXTRA_STREAM,Uri::class.java)?.let {list.add(it)}
    data.clipData?.let {for(i in 0 until it.itemCount)it.getItemAt(i).uri?.let {u->list.add(u)}}
    data.data?.let {list.add(it)}
    val distinct=list.distinct();require(distinct.size<=8) {"Choose at most eight files per batch."};return distinct
  }
  private fun receive(intent:Intent) {if(intent.action !in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE))return
    val uris=try {inputs(intent)}catch(_:Exception){if(ctx.hasActiveReactInstance())ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("VaultorMediaInputs","Share at most eight files. Choose a smaller batch.");return};val text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.take(100000)
    worker.execute {try {uris.forEach {stage(it)};if(!text.isNullOrBlank())synchronized(lock){val r=records();require(r.length()<8);val id=UUID.randomUUID().toString();r.put(id,JSONObject().put("id",id).put("text",text).put("title","Shared text").put("bytes",0));persist(r)}}catch(_:Exception){if(ctx.hasActiveReactInstance())ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("VaultorMediaInputs","Some shared inputs could not be read. Use the picker to retry.")};emit()}
  }
  override fun onNewIntent(intent:Intent) {receive(intent)}
  override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?) {
    if(requestCode!=4404)return
    val p=pending ?: return;pending=null;val action=pendingAction
    if(resultCode!=Activity.RESULT_OK){camera?.delete();camera=null;outgoing=null;p.resolve("[]");return}
    worker.execute {try {
      if(action=="save") {val target=data?.data ?: error("No save destination.");require(target.scheme=="content");val source=outgoing ?: error("Save source missing");ctx.contentResolver.openOutputStream(target,"wt")?.use {out->source.inputStream().use {it.copyTo(out)}} ?: error("Cannot write destination");outgoing=null;p.resolve("{\"requested\":true}")}
      else {val uris=if(action=="camera")listOf(FileProvider.getUriForFile(ctx,ctx.packageName+".media",camera ?: error("Camera output missing")))else inputs(data ?: Intent());val result=JSONArray();uris.forEach {result.put(stage(it))};camera?.delete();camera=null;p.resolve(result.toString());emit()}
    }catch(e:Exception){camera?.delete();camera=null;outgoing=null;p.reject("MEDIA_INPUT",e.message ?: "Input failed. Retry with the file picker.")}}
  }
  fun cancel() {active.forEach {it.disconnect()};cache.listFiles()?.forEach {it.delete()};shares.listFiles()?.forEach {it.delete()}}
  private fun choose(action:String,p:Promise) {ctx.runOnUiQueueThread {try {
    require(pending==null) {"A picker is already open."};val activity=ctx.currentActivity ?: error("Open Vaultor before selecting files.")
    val intent=when(action) {
      "camera"->{camera=File(shares,"capture-${UUID.randomUUID()}.jpg");val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",camera!!);Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION).apply {clipData=ClipData.newRawUri("Camera output",uri)}}
      "photos"->Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*").putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,8)
      else->Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)
    }
    pending=p;pendingAction=action;try {activity.startActivityForResult(intent,4404)}catch(e:Exception){pending=null;camera?.delete();camera=null;throw e}
  }catch(_:Exception){p.reject("MEDIA_PICKER","No compatible picker/camera is available. Use Files instead.")}}}
  private fun bytes(a:JSONObject,id:String,variant:String="raw"):File {
    require(id.matches(Regex("[a-fA-F0-9-]{36}")));valid(a)
    val key=MessageDigest.getInstance("SHA-256").digest((a.getString("scope")+id+variant).toByteArray()).joinToString(""){"%02x".format(it)}
    val f=File(cache,key);if(f.exists()){f.setLastModified(System.currentTimeMillis());return f}
    val con=connection(a,"/resources/$id/$variant","GET");active.add(con)
    try {require(con.responseCode in 200..299) {"Resource unavailable (${con.responseCode}). Retry or replace it."};val max=if(variant=="thumbnail")384*1024 else FILE_LIMIT
      require(con.contentLengthLong<=max);val data=con.inputStream.use {it.readNBytes(max+1)};require(data.size<=max){"Resource exceeds the mobile 64 MiB file limit."};valid(a)
      while((cache.listFiles()?.sumOf {it.length()} ?: 0)+data.size>96L*1024*1024){val old=cache.listFiles()?.minByOrNull {it.lastModified()} ?: break;old.delete()}
      f.writeBytes(data);return f
    }finally {active.remove(con);con.disconnect()}
  }
  private fun rendered(bitmap:Bitmap):String {
    val dest=File(cache,"render-${UUID.randomUUID()}.png");dest.outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    while((cache.listFiles()?.sumOf {it.length()} ?: 0)>96L*1024*1024 || (cache.listFiles()?.size ?: 0)>32){val old=cache.listFiles()?.filter {it!=dest}?.minByOrNull {it.lastModified()} ?: break;old.delete()}
    return Uri.fromFile(dest).toString()
  }
  private fun copyForShare(a:JSONObject):File {
    val f=bytes(a,a.getString("resourceId"));val dest=File(shares,a.getString("resourceId")+"-"+safeName(a.optString("title","attachment")));f.copyTo(dest,true);dest.setLastModified(System.currentTimeMillis())
    while((shares.listFiles()?.sumOf {it.length()} ?: 0)>80L*1024*1024 || (shares.listFiles()?.size ?: 0)>16){val old=shares.listFiles()?.filter {it!=dest && it!=camera && it!=outgoing}?.minByOrNull {it.lastModified()} ?: break;old.delete()};return dest
  }
  fun call(action:String,a:JSONObject,p:Promise) {
    if(action in listOf("photos","files","camera")){choose(action,p);return}
    if(action=="clipboard"){ctx.runOnUiQueueThread {try {val clip=(ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip;val uris=(0 until (clip?.itemCount ?: 0)).mapNotNull {clip!!.getItemAt(it).uri};if(uris.isEmpty()){p.reject("MEDIA_CLIPBOARD","Clipboard has no accessible image. Use Photos or Files.");return@runOnUiQueueThread};worker.execute {try {val items=JSONArray();require(uris.size<=8) {"Choose at most eight clipboard files."};uris.forEach {items.put(stage(it))};p.resolve(items.toString());emit()}catch(e:Exception){p.reject("MEDIA_CLIPBOARD",e.message ?: "Clipboard cannot be read. Use Files.")}}}catch(_:Exception){p.reject("MEDIA_CLIPBOARD","Clipboard is unavailable. Use Files.")}};return}
    worker.execute {try {val result=when(action) {
      "list" -> {if(!cold){cold=true;ctx.currentActivity?.intent?.let {receive(it)}};synchronized(lock){val r=records();JSONArray().also {out->r.keys().forEach {out.put(r.getJSONObject(it))}}}.toString()}
      "remove" -> synchronized(lock){val r=records();val id=a.getString("id");require(id.matches(Regex("[a-fA-F0-9-]{36}")));r.remove(id);persist(r);File(root,"$id.bin").delete();"{}"}
      "bind" -> synchronized(lock){val r=records();val item=r.getJSONObject(a.getString("id"));val binding=a.getJSONObject("binding");require(binding.getString("noteId").matches(Regex("[a-fA-F0-9-]{36}")) && binding.getString("scope").length<=512);if(item.has("binding"))require(item.getJSONObject("binding").getString("scope")==binding.getString("scope") && item.getJSONObject("binding").getString("noteId")==binding.getString("noteId"));item.put("binding",binding);persist(r);item.toString()}
      "upload" -> {
        val item=synchronized(lock){JSONObject(records().getJSONObject(a.getString("id")).toString())};val binding=item.getJSONObject("binding");require(binding.getString("scope")==a.getString("scope") && binding.getString("hostId")==a.getString("hostId")){"Input belongs to another workspace. Reopen its source."};valid(a)
        if(item.has("resourceId"))item.toString()else {
          val content=unseal(File(root,item.getString("id")+".bin").readBytes());if(item.getBoolean("image"))image(content)
          val id=item.getString("id");val boundary="vaultor-$id";val con=connection(a,"/resources/imports/$id","PUT");active.add(con)
          try {con.doOutput=true;con.setChunkedStreamingMode(65536);con.setRequestProperty("Content-Type","multipart/form-data; boundary=$boundary")
            con.outputStream.use {out->out.write("--$boundary\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n${item.getString("title")}\r\n--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${item.getString("title").replace("\"","_")}\"\r\nContent-Type: ${item.getString("mime")}\r\n\r\n".toByteArray());out.write(content);out.write("\r\n--$boundary--\r\n".toByteArray())}
            require(con.responseCode in 200..299) {"Upload failed (${con.responseCode}). Retry uses the same identity."};val response=JSONObject(String(con.inputStream.use {it.readNBytes(1500001)}));require(response.getString("id")==id)
            synchronized(lock){val r=records();val saved=r.getJSONObject(id);saved.put("resourceId",id);persist(r);saved.toString()}
          }finally{active.remove(con);con.disconnect()}
        }
      }
      "thumbnail" -> {val f=bytes(a,a.getString("resourceId"),"thumbnail");JSONObject().put("data","data:image/png;base64,"+Base64.encodeToString(f.readBytes(),Base64.NO_WRAP)).toString()}
      "preview" -> {val f=bytes(a,a.getString("resourceId"));val mime=a.optString("mime","");val result=JSONObject()
        if(mime.startsWith("image/")){val info=image(f.readBytes());val bitmap=ImageDecoder.decodeBitmap(ImageDecoder.createSource(f)){decoder,header,_->require(header.size.width.toLong()*header.size.height<=PIXEL_LIMIT);val ratio=minOf(1.0,2048.0/maxOf(header.size.width,header.size.height));decoder.setTargetSize(maxOf(1,(header.size.width*ratio).toInt()),maxOf(1,(header.size.height*ratio).toInt()));decoder.allocator=ImageDecoder.ALLOCATOR_SOFTWARE};val w=bitmap.width;val h=bitmap.height;result.put("uri",rendered(bitmap)).put("width",w).put("height",h).put("static",true)}
        else if(mime=="application/pdf"){require(f.length()<=IMAGE_LIMIT){"PDF preview is limited to 20 MiB. Save/Open original instead."};PdfRenderer(ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY)).use {pdf->require(pdf.pageCount>0);val page=a.optInt("page",0).coerceIn(0,pdf.pageCount-1);pdf.openPage(page).use {pg->val w=pg.width.coerceAtMost(1280);val h=(pg.height.toLong()*w/pg.width).coerceAtMost(2000).toInt();val b=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);b.eraseColor(android.graphics.Color.WHITE);pg.render(b,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);result.put("uri",rendered(b)).put("pages",pdf.pageCount).put("page",page)}}}
        else if(mime.startsWith("text/")){result.put("text",String(f.inputStream().use {it.readNBytes(100000)},Charsets.UTF_8)).put("limited",f.length()>100000)}
        else result.put("external",true)
        result.toString()
      }
      "share","open","copy","save" -> {val f=copyForShare(a);val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",f);val mime=a.optString("mime","application/octet-stream");ctx.runOnUiQueueThread {try {val activity=ctx.currentActivity ?: error("Open Vaultor first")
        when(action){
          "save"->{require(pending==null);outgoing=f;pending=p;pendingAction="save";activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,safeName(a.optString("title","attachment"))),4404)}
          "copy"->{require(mime.startsWith("image/"));(ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newUri(ctx.contentResolver,"Vaultor image",uri));p.resolve("{\"requested\":true}")}
          else->{val intent=if(action=="share")Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri)else Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.clipData=ClipData.newRawUri(f.name,uri);activity.startActivity(if(action=="share")Intent.createChooser(intent,"Share original")else intent);p.resolve("{\"requested\":true}")}
        }
      }catch(_:Exception){pending=null;outgoing=null;p.reject("MEDIA_DESTINATION","No compatible viewer/destination. Save original instead.")}};return@execute}
      else -> error("Unsupported media operation")
    };p.resolve(result)}catch(e:Exception){p.reject("MEDIA_FAILURE",if(e is javax.net.ssl.SSLException)"Host TLS verification failed." else e.message?.take(180) ?: "Media unavailable. Retry without removing your draft.")}}
  }
}
