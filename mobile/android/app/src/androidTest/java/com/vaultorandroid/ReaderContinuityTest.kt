package com.vaultorandroid

import android.content.Intent
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ReaderContinuityTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val d get() = UiDevice.getInstance(i)
  private fun tap(label:String) {
    var node=d.wait(Until.findObject(By.desc(label).enabled(true)),3000)
    if(node==null) node=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)))
    assertNotNull("Missing action: $label",node); node!!.click(); Thread.sleep(250)
  }
  private fun web():WebView {
    var found:WebView?=null
    i.runOnMainSync {
      fun visit(v:View) { if(v is WebView) found=v; if(v is ViewGroup) for(n in 0 until v.childCount) visit(v.getChildAt(n)) }
      WindowInspector.getGlobalWindowViews().forEach(::visit)
    }
    return found ?: error("WebView absent")
  }
  private fun js(code:String, view:WebView=web()):String {
    val done=CountDownLatch(1); var answer="null"
    i.runOnMainSync {view.evaluateJavascript(code){answer=it;done.countDown()}}
    assertTrue(done.await(5,TimeUnit.SECONDS));return answer
  }
  private fun waitJs(code:String) {repeat(60){if(js(code)=="true")return;Thread.sleep(100)};fail(code)}
  private fun openReader() {
    i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(d.wait(Until.hasObject(By.desc("Open navigation").enabled(true)),30000))
    tap("Open navigation");tap("Library")
    val search=d.wait(Until.findObject(By.desc("Search resources")),10000);search.text=""
    tap("R2 Rich reading, Note")
    assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),15000));waitJs("!!document.querySelector('article p')")
  }
  private fun options(label:String) {tap("Reading options");tap(label)}
  private fun touch(selector:String,long:Boolean=false) {
    val w=web();val raw=JSONObject(js("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()",w))
    Thread.sleep(400);val at=IntArray(2);var density=1f
    i.runOnMainSync {w.getLocationOnScreen(at);density=w.resources.displayMetrics.density}
    val x=at[0]+(raw.getDouble("x")*density).toInt();val y=at[1]+(raw.getDouble("y")*density).toInt()
    if(long)d.swipe(x,y,x,y,150) else d.click(x,y)
  }
  @org.junit.After fun capture() {
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"a2-last.png"))
    d.dumpWindowHierarchy(File(i.targetContext.getExternalFilesDir(null),"a2-last.xml"))
    d.unfreezeRotation()
  }
  @Test fun readingEdgeAndFind() {
    openReader();val retained=web();val originalHeight=retained.height;val originalTop=IntArray(2);i.runOnMainSync {retained.getLocationOnScreen(originalTop)}
    val bounds=d.findObject(By.clazz("android.webkit.WebView")).visibleBounds;d.swipe(bounds.centerX(),bounds.centerY(),bounds.centerX(),bounds.centerY()-40,8);Thread.sleep(300)
    js("window.a2Node=[...document.querySelectorAll('p')].find(p=>p.textContent.startsWith('Paragraph 18.'));window.scrollTo(0,window.scrollY+a2Node.getBoundingClientRect().top-20);true")
    waitJs("Math.abs(a2Node.getBoundingClientRect().top-20)<3");Thread.sleep(400);val before=js("a2Node.getBoundingClientRect().top").toDouble();assertEquals(20.0,before,3.0);val viewport=retained.height
    val workingTop=IntArray(2);i.runOnMainSync {retained.getLocationOnScreen(workingTop)}
    assertEquals(originalHeight,viewport);assertArrayEquals(originalTop,workingTop)
    options("Reading appearance")
    val size=js("parseFloat(document.documentElement.style.getPropertyValue('--size'))",retained).toDouble()
    val change=if(size>=27) "Decrease Text size" else "Increase Text size"
    tap(change);Thread.sleep(300);tap("Done")
    assertSame(retained,web());assertEquals(before,js("a2Node.getBoundingClientRect().top").toDouble(),3.0)
    options("Reading appearance");tap(if(size>=27) "Increase Text size" else "Decrease Text size");tap("Done")
    options("Find within note");val field=d.wait(Until.findObject(By.desc("Find within note").focused(true)),5000)
    assertNotNull("Find must acquire focus after the modal closes",field)
    field.text="Paragraph 18";assertTrue("Find must return an actual match",d.wait(Until.hasObject(By.text("1/1")),5000));d.pressEnter();Thread.sleep(700)
    assertNotNull(d.findObject(By.desc("Close find")));assertEquals("Find must not consume the viewport after IME closes",viewport,retained.height)
    assertSame(retained,web());tap("Close find")
    assertEquals("true",js("a2Node.isConnected"));assertEquals("0",js("document.querySelectorAll('[contenteditable],input').length"))
    d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"a2-reader.png"))
    touch("p",true);val copy=d.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)^copy$"))),5000)
    assertNotNull("Native Copy must remain available",copy);val selected=js("String(getSelection())")
    assertTrue(selected.length>2);copy!!.click()
    var copied="";val expected=org.json.JSONArray("["+selected+"]").getString(0)
    for(attempt in 0..19){i.runOnMainSync {copied=(i.targetContext.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).primaryClip?.getItemAt(0)?.text?.toString() ?: ""};if(copied==expected)break;Thread.sleep(100)}
    assertEquals(org.json.JSONArray("["+selected+"]").getString(0),copied)
  }
  @Test fun mediaControlsAndGallery() {
    openReader();val source=web()
    touch("figure button");assertTrue(d.wait(Until.hasObject(By.desc("Close preview")),15000));waitJs("document.querySelector('#image').complete&&document.querySelector('#image').naturalWidth>0")
    val media=web();val height=media.height
    assertFalse("Secondary tools should be contextual",d.hasObject(By.desc("Fit")))
    tap("Preview options");assertSame(media,web());assertEquals(height,media.height)
    tap("Zoom in");tap("Done");waitJs("parseFloat(document.querySelector('#image').style.width)>0")
    tap("Preview options");tap("Fit");assertTrue(d.wait(Until.gone(By.text("Preview controls")),5000));Thread.sleep(500)
    assertSame(media,web());assertEquals(height,media.height)
    val rootBefore=media.rootView
    tap("Next image");assertTrue(d.wait(Until.hasObject(By.text("image-2.png")),10000));Thread.sleep(500)
    assertSame("Gallery must retain the preview window",rootBefore,web().rootView)
    tap("Close preview");assertSame(source,web())
    touch("a.resource[data-resource-id]")
    assertTrue(d.wait(Until.hasObject(By.desc("PDF page controls")),15000));waitJs("document.querySelector('#image').complete")
    val pdf=web();val pdfHeight=pdf.height
    tap("PDF page controls");val initialPage=d.wait(Until.findObject(By.desc("PDF page number")),5000);initialPage.text="1";tap("Go to PDF page");assertTrue(d.wait(Until.hasObject(By.text("Page 1 of 12")),10000))
    tap("Next page");assertTrue(d.wait(Until.hasObject(By.text("Page 2 of 12")),10000))
    tap("PDF page controls");val page=d.wait(Until.findObject(By.desc("PDF page number")),5000);page.text="8";tap("Go to PDF page")
    assertTrue(d.wait(Until.hasObject(By.text("Page 8 of 12")),10000));assertSame(pdf,web());assertEquals(pdfHeight,pdf.height)
    tap("Close preview");assertSame(source,web())
  }
  @Test fun readerThemeSnapshotPixels() {
    openReader()
    js("document.querySelector('figure').scrollIntoView({block:'center'});true")
    waitJs("!!document.querySelector('figure img')&&document.querySelector('figure img').complete")
    Thread.sleep(300)
    val context=(i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
    val presentation=context.getNativeModule("VaultorPresentation") as VaultorPresentation
    lateinit var live:android.graphics.Bitmap;val copied=CountDownLatch(1);var copyResult=-1;var tag=0
    val reader=web();val at=IntArray(2)
    i.runOnMainSync {
      val activity=context.currentActivity!!;val decor=activity.window.decorView
      live=android.graphics.Bitmap.createBitmap(decor.width,decor.height,android.graphics.Bitmap.Config.ARGB_8888)
      reader.getLocationOnScreen(at)
      fun visit(v:View) {if(v.contentDescription?.toString()=="Reading options")tag=v.id;if(v is ViewGroup)for(n in 0 until v.childCount)visit(v.getChildAt(n))}
      visit(decor)
      android.view.PixelCopy.request(activity.window,live,{code->copyResult=code;copied.countDown()},android.os.Handler(android.os.Looper.getMainLooper()))
    }
    assertTrue(copied.await(5,TimeUnit.SECONDS));assertEquals(android.view.PixelCopy.SUCCESS,copyResult);assertTrue(tag>0)
    val captured=CountDownLatch(1);var success=false
    presentation.prepareTheme(tag.toDouble(),"a2-reader-pixels",PromiseImpl(Callback {v->success=v[0]==true;captured.countDown()},Callback {captured.countDown()}))
    assertTrue(captured.await(5,TimeUnit.SECONDS));assertTrue(success)
    try {
      i.runOnMainSync {
        val field=VaultorPresentation::class.java.getDeclaredField("overlays").apply{isAccessible=true}
        val overlay=(field.get(presentation) as List<*>).first()!!
        val bitmap=overlay.javaClass.getDeclaredField("bitmap").apply{isAccessible=true}.get(overlay) as android.graphics.Bitmap
        var colored=0;var matched=0
        for(y in at[1]+20 until minOf(at[1]+reader.height-20,live.height-1) step 16)
          for(x in 20 until live.width-20 step 16) {
            val a=live.getPixel(x,y);val channels=listOf(android.graphics.Color.red(a),android.graphics.Color.green(a),android.graphics.Color.blue(a))
            if(channels.max()-channels.min()>40) {
              colored++;val b=bitmap.getPixel(x,y)
              if(kotlin.math.abs(android.graphics.Color.red(a)-android.graphics.Color.red(b))<12&&kotlin.math.abs(android.graphics.Color.green(a)-android.graphics.Color.green(b))<12&&kotlin.math.abs(android.graphics.Color.blue(a)-android.graphics.Color.blue(b))<12)matched++
            }
          }
        assertTrue("Reader image pixels absent in live reference",colored>20)
        assertTrue("Old-palette snapshot lost native reader pixels: $matched/$colored",matched>=colored*0.95)
      }
    } finally {presentation.cancelTheme();live.recycle()}
  }
  private fun edge(commit:Boolean) {
    val start=SystemClock.uptimeMillis();val y=d.displayHeight*0.55f;val width=d.displayWidth.toFloat()
    fun event(action:Int,x:Float) {val e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,x,y,0);e.source=android.view.InputDevice.SOURCE_TOUCHSCREEN;assertTrue(i.uiAutomation.injectInputEvent(e,true));e.recycle()}
    event(MotionEvent.ACTION_DOWN,1f)
    for(n in 1..12){event(MotionEvent.ACTION_MOVE,width*0.55f*n/12);Thread.sleep(12)}
    if(!commit) for(n in 12 downTo 0){event(MotionEvent.ACTION_MOVE,width*0.55f*n/12);Thread.sleep(12)}
    event(MotionEvent.ACTION_UP,if(commit)width*0.55f else 1f);Thread.sleep(800)
  }
  @Test fun predictiveBackCancellationAndCommit() {
    openReader();val source=web();val identity=js("document.querySelector('#document').dataset.noteId")
    edge(false);assertNotNull(d.findObject(By.desc("Reading options")));assertSame(source,web());assertEquals(identity,js("document.querySelector('#document').dataset.noteId"))
    touch("figure button");assertTrue(d.wait(Until.hasObject(By.desc("Close preview")),15000));val preview=web()
    edge(false);assertNotNull(d.findObject(By.desc("Close preview")));assertSame(preview,web())
    edge(true);assertTrue("Committed system gesture did not close preview",d.wait(Until.gone(By.desc("Close preview")),5000));assertSame(source,web())
    edge(true);assertTrue("Committed reader Back did not restore origin",d.wait(Until.hasObject(By.desc("Search resources")),5000))
  }
}
