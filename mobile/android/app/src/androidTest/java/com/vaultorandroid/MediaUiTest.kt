package com.vaultorandroid

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MediaUiTest {
  private fun web(view:View):WebView? {if(view is WebView)return view;if(view is ViewGroup)for(i in 0 until view.childCount){val found=web(view.getChildAt(i));if(found!=null)return found};return null}
  private fun touchImage(device:UiDevice) {val instrumentation=InstrumentationRegistry.getInstrumentation();val latch=CountDownLatch(1);var x=0;var y=0
    instrumentation.runOnMainSync {val app=instrumentation.targetContext.applicationContext as MainApplication;val activity=app.reactHost.currentReactContext?.currentActivity ?: error("Activity missing");val view=web(activity.window.decorView) ?: error("Editor missing");val origin=IntArray(2);view.getLocationOnScreen(origin);val density=view.resources.displayMetrics.density
      view.evaluateJavascript("(()=>{const e=document.querySelector('.image-frame');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()") {value->if(value!="null"){val rect=JSONObject(value);x=origin[0]+(rect.getDouble("x")*density).toInt();y=origin[1]+(rect.getDouble("y")*density).toInt()};latch.countDown()}}
    assertTrue(latch.await(10,TimeUnit.SECONDS));assertTrue(x>0 && y>0);assertTrue(device.click(x,y))
  }
  @Test fun clipboardPlacementToolsAndSave() {
    val instrumentation=InstrumentationRegistry.getInstrumentation();val ctx=instrumentation.targetContext;val device=UiDevice.getInstance(instrumentation)
    ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(device.wait(Until.hasObject(By.text("Add image/file")),20000))
    val file=File(File(ctx.cacheDir,"media-share").apply {mkdirs()},"ui-image.png");val bitmap=Bitmap.createBitmap(96,64,Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.CYAN);file.outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",file)
    instrumentation.runOnMainSync {(ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newUri(ctx.contentResolver,"Fixture image",uri))}
    device.findObject(By.text("Add image/file")).click();assertTrue(device.wait(Until.hasObject(By.text("Paste clipboard image")),5000));device.findObject(By.text("Paste clipboard image")).click()
    assertTrue(device.wait(Until.hasObject(By.text("No pending inputs.")),30000));device.findObject(By.text("Close inputs")).click()
    touchImage(device);assertTrue(device.wait(Until.hasObject(By.text("Image tools")),10000));device.findObject(By.desc("Image width percentage")).text="44";device.findObject(By.desc("Image caption")).text="A4 caption";device.findObject(By.desc("Image alternative text")).text="Cyan rectangle"
    device.findObject(By.text("Apply image changes")).click();assertTrue(device.wait(Until.hasObject(By.text("Save")),10000));device.findObject(By.text("Save")).click()
    assertTrue(device.wait(Until.hasObject(By.textContains("Saved")),20000));touchImage(device);assertTrue(device.wait(Until.hasObject(By.text("Image tools")),5000));assertEquals("44",device.findObject(By.desc("Image width percentage")).text);assertEquals("A4 caption",device.findObject(By.desc("Image caption")).text)
    device.findObject(By.text("Preview image")).click();assertTrue(device.wait(Until.hasObject(By.text("Close preview")),10000));assertTrue(device.wait(Until.hasObject(By.text("Fit")),15000));device.findObject(By.text("Close preview")).click();assertTrue(device.wait(Until.hasObject(By.text("Save")),5000))
    touchImage(device);assertTrue(device.wait(Until.hasObject(By.text("Copy image")),5000));device.findObject(By.text("Copy image")).click();Thread.sleep(1500)
    var copied:android.net.Uri?=null;instrumentation.runOnMainSync {copied=(ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip?.getItemAt(0)?.uri}
    assertNotNull(copied);assertEquals("content",copied!!.scheme);assertArrayEquals(file.readBytes(),ctx.contentResolver.openInputStream(copied!!)?.use {it.readBytes()})
    device.findObject(By.text("Close image tools")).click()
    file.delete()
  }
  @Test fun cancelledPickersAndExplicitShareTarget() {
    val instrumentation=InstrumentationRegistry.getInstrumentation();val ctx=instrumentation.targetContext;val device=UiDevice.getInstance(instrumentation)
    ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(device.wait(Until.hasObject(By.text("Add image/file")),20000))
    for(label in listOf("Photos","Files")) {
      device.findObject(By.text("Add image/file")).click();assertTrue(device.wait(Until.hasObject(By.text(label)),5000));device.findObject(By.text(label)).click();Thread.sleep(1200);device.pressBack();assertTrue(device.wait(Until.hasObject(By.text("Add image/file")),10000))
    }
    val file=File(File(ctx.cacheDir,"media-share").apply {mkdirs()},"shared-a4.txt").apply {writeText("Disposable shared content")};val uri=FileProvider.getUriForFile(ctx,ctx.packageName+".media",file)
    val intent=Intent(Intent.ACTION_SEND).setClassName(ctx.packageName,"com.vaultorandroid.MainActivity").setType("text/plain").putExtra(Intent.EXTRA_STREAM,uri).putExtra(Intent.EXTRA_TEXT,"Accompanying shared text").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION).apply {clipData=ClipData.newRawUri("Fixture shared input",uri)}
    ctx.startActivity(intent);assertTrue(device.wait(Until.hasObject(By.text("Pending / shared inputs")),15000));assertTrue(device.hasObject(By.textContains("shared-a4.txt")));assertTrue(device.hasObject(By.textContains("Shared text")))
    // Receipt is staged, never inserted into whatever note happened to be focused.
    val rows=device.findObjects(By.text("Remove pending input"));assertEquals(2,rows.size);rows[0].click();assertTrue(device.wait(Until.hasObject(By.text("Remove pending input")),5000));device.findObject(By.text("Remove pending input")).click();assertTrue(device.wait(Until.hasObject(By.text("No pending inputs.")),5000));device.findObject(By.text("Close inputs")).click();file.delete()
  }
}
