package com.vaultorandroid
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.view.inspector.WindowInspector
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
@RunWith(AndroidJUnit4::class)
class CaptureExperienceTest {
  init{require(android.os.Build.HARDWARE=="ranchu")}
  private val i get()=InstrumentationRegistry.getInstrumentation()
  private val d get()=UiDevice.getInstance(i)
  private fun tap(label:String){var n=d.wait(Until.findObject(By.desc(label).enabled(true)),5000);if(n==null)n=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.desc(label).enabled(true)));assertNotNull(label,n);n!!.click();Thread.sleep(250)}
  private fun web():WebView{var found:WebView?=null;i.runOnMainSync{fun find(v:View){if(v is WebView)found=v;if(v is ViewGroup)for(n in 0 until v.childCount)find(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::find)};return found?:error("No reader")}
  private fun js(code:String):String {val latch=CountDownLatch(1);var value="null";val w=web();i.runOnMainSync{w.evaluateJavascript(code){value=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return value}
  private fun captures():JSONArray{val latch=CountDownLatch(1);var raw="";var failed=false;VaultorModule(BridgeReactContext(i.targetContext)).reviewCapture("list","{}",PromiseImpl(Callback{raw=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(10,TimeUnit.SECONDS));assertFalse(failed);return JSONArray(raw)}
  private fun result(call:(PromiseImpl)->Unit):String{val latch=CountDownLatch(1);var value="";var failed=false;call(PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(15,TimeUnit.SECONDS));assertFalse(failed);return value}
  private fun saved():String {
    val m=VaultorModule(BridgeReactContext(i.targetContext));val b=JSONObject(result{m.storage("bootstrap","{}",it)});val host=b.getString("selected");val epoch=b.getString("epoch");val profiles=b.getJSONArray("profiles");val p=(0 until profiles.length()).map{profiles.getJSONObject(it)}.first{it.getString("hostId")==host}
    val a=JSONObject().put("hostId",host).put("epoch",epoch).put("workspaceId",p.optString("workspaceId"));val available=result{m.companion("available",a.toString(),it)};val id=JSONArray("["+js("document.querySelector('#document').dataset.noteId")+"]").getString(0)
    val resource=if(available!="null" && !JSONObject(available).optBoolean("locked")) {a.put("scope",JSONObject(available).getString("scope")).put("path","/resources/"+id);JSONObject(result{m.companion("read",a.toString(),it)})}else {val r=JSONObject(result{m.apiFor(host,epoch,"/resources/"+id,"GET",null,null,it)});assertEquals(200,r.getInt("status"));JSONObject(r.getString("body"))}
    return JSONObject().put("revision",resource.getString("revision")).put("content",resource.get("content")).toString()
  }
  private fun launch(){i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Open navigation").enabled(true)),30000))}
  private fun reader(){
    launch()
    if(d.hasObject(By.desc("Review comment")))tap("Done")
    if(!d.hasObject(By.desc("Reading options")) || !d.hasObject(By.text("R2 Rich reading"))) {
      tap("Open navigation");tap("Library");d.wait(Until.findObject(By.desc("Search resources")),10000).text=""
      assertTrue("Fixture Library must finish loading",d.wait(Until.hasObject(By.desc("R2 Rich reading, Note")),30000));tap("R2 Rich reading, Note")
    }
    repeat(100){try{if(js("!!document.querySelector('article p')")=="true")return}catch(_:IllegalStateException){};Thread.sleep(100)};fail("Reader not ready")
  }
  @org.junit.After fun frame(){d.takeScreenshot(java.io.File(i.targetContext.getExternalFilesDir(null),"a3-last.png"));d.dumpWindowHierarchy(java.io.File(i.targetContext.getExternalFilesDir(null),"a3-last.xml"))}
  @Test fun selectionQueueRetainsReaderAndOriginal(){
    reader();val retained=web();val original=saved();val before=captures().length()
    val quote=js("(()=>{const p=document.querySelector('article p');const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));return s.toString()})()")
    tap("Flag for review");assertTrue(d.wait(Until.hasObject(By.desc("Review comment")),10000));val field=d.findObject(By.desc("Review comment"));field.text="A3 selection receipt"
    assertTrue(d.wait(Until.hasObject(By.text("Protected draft on this phone · "+"A3 selection receipt".length+"/5000")),10000));tap("Save on this phone");assertTrue(d.wait(Until.hasObject(By.textContains("On this phone · pending sync")),10000))
    val after=captures();assertEquals(before+1,after.length());val item=after.getJSONObject(0);assertEquals("queued",item.getString("state"));assertEquals("A3 selection receipt",item.getJSONObject("body").getString("comment"));assertEquals(JSONArray("["+quote+"]").getString(0),item.getJSONObject("body").getString("quote"));assertEquals("block",item.getJSONObject("body").getJSONObject("locator").getString("kind"))
    tap("Done");assertSame(retained,web());assertEquals(original,saved());assertEquals("0",js("document.querySelectorAll('[contenteditable]').length"))
  }
  @Test fun seedProtectedDraft(){
    reader();tap("Reading options");tap("Add review item");val field=d.wait(Until.findObject(By.desc("Review comment")),10000);assertNotNull(field)
    val comment="A3 process death "+java.util.UUID.randomUUID();field.text=comment
    assertTrue(d.wait(Until.hasObject(By.text("Protected draft on this phone · "+comment.length+"/5000")),10000))
    val item=captures().getJSONObject(0);assertEquals(comment,item.getJSONObject("body").getString("comment"));java.io.File(i.targetContext.noBackupFilesDir,"a3-draft-fixture.json").writeText(item.toString())
  }
  @Test fun restoreProtectedDraftAfterDeath(){
    val fixture=JSONObject(java.io.File(i.targetContext.noBackupFilesDir,"a3-draft-fixture.json").readText());val comment=fixture.getJSONObject("body").getString("comment")
    launch();tap("Open navigation");tap("Captures on this phone")
    var summary=d.wait(Until.findObject(By.textStartsWith(comment+" ·")),5000);if(summary==null)summary=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.textStartsWith(comment+" ·")))
    assertNotNull("Exact retained draft must be identifiable",summary);summary!!.parent.findObject(By.desc("R2 Rich reading · Protected draft")).click()
    val field=d.wait(Until.findObject(By.desc("Review comment")),5000);assertEquals(comment,field.text);tap("Save on this phone");assertTrue(d.wait(Until.hasObject(By.textContains("On this phone · pending sync")),10000));assertEquals("queued",(0 until captures().length()).map{captures().getJSONObject(it)}.first{it.getString("id")==fixture.getString("id")}.getString("state"));tap("Done")
  }
  @Test fun nativeCopyRemainsAvailable(){
    reader();val w=web();val point=JSONObject(js("(()=>{const p=document.querySelector('article p');p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()"));Thread.sleep(400);val at=IntArray(2);var density=1f;i.runOnMainSync{w.getLocationOnScreen(at);density=w.resources.displayMetrics.density};val x=at[0]+(point.getDouble("x")*density).toInt();val y=at[1]+(point.getDouble("y")*density).toInt();d.swipe(x,y,x,y,150)
    val copy=d.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)^copy$"))),5000);assertNotNull("Native Copy must remain",copy);val selected=JSONArray("["+js("String(getSelection())")+"]").getString(0);assertTrue(selected.isNotBlank());copy!!.click();var copied="";for(n in 0..19){i.runOnMainSync{copied=(i.targetContext.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).primaryClip?.getItemAt(0)?.text?.toString()?:""};if(copied==selected)break;Thread.sleep(100)};assertEquals(selected,copied)
  }
  @Test fun themesAndLargeFontReceipt(){
    val scale=d.executeShellCommand("settings get system font_scale").trim()
    reader();val context=(i.targetContext.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
    val native=VaultorModule(context);val preferences=result{native.readerPreferences("get","{}",it)}
    try{
      d.executeShellCommand("settings put system font_scale 1.3");Thread.sleep(1000)
      for(theme in listOf("Light","Dark","OLED")){
        reader();val retained=web();val original=saved();tap("Reading options");tap("Reading appearance");tap(theme);Thread.sleep(550);tap("Done")
        tap("Reading options");tap("Add review item");assertTrue(d.wait(Until.hasObject(By.text("Evidence locked to this source")),5000))
        val field=d.wait(Until.findObject(By.desc("Review comment")),10000);field.text="Remediation $theme large text"
        assertTrue(d.wait(Until.hasObject(By.text("Protected draft on this phone · "+"Remediation $theme large text".length+"/5000")),10000));tap("Save on this phone")
        var receipt=d.wait(Until.findObject(By.textStartsWith("On this phone · pending sync")),5000)
        if(receipt==null)receipt=d.findObject(By.scrollable(true))?.scrollUntil(Direction.DOWN,Until.findObject(By.textStartsWith("On this phone · pending sync")))
        assertNotNull(receipt);Thread.sleep(450)
        var complete=false;i.runOnMainSync{fun visit(v:View){if(v is android.widget.TextView && v.text.toString().startsWith("On this phone · pending sync")){complete=v.layout!=null && v.height>=v.layout.getLineBottom(v.lineCount-1)};if(v is ViewGroup)for(n in 0 until v.childCount)visit(v.getChildAt(n))};WindowInspector.getGlobalWindowViews().forEach(::visit)}
        assertTrue("Saved receipt must measure all large-text lines",complete);d.takeScreenshot(java.io.File(i.targetContext.getExternalFilesDir(null),"remediation-$theme-large.png"));tap("Done");assertSame(retained,web());assertEquals(original,saved())
      }
    }finally{result{native.readerPreferences("put",preferences,it)};if(scale=="null")d.executeShellCommand("settings delete system font_scale")else d.executeShellCommand("settings put system font_scale $scale")}
  }
  private fun ime():Boolean {var shown=false;i.runOnMainSync{shown=WindowInspector.getGlobalWindowViews().any{it.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime())==true}};return shown}
  @Test fun failedProtectionCanKeepOrDiscard(){
    val blocked=java.io.File(i.targetContext.noBackupFilesDir,"vaultor-reviews.bin.new");val guard=java.io.File(blocked,"a3-fault")
    fun fault(){assertTrue(blocked.mkdir());guard.writeText("disposable fault")}
    fun clear(){guard.delete();blocked.delete()}
    try{
      reader();val retained=web();tap("Reading options");tap("Add review item");var field=d.wait(Until.findObject(By.desc("Review comment")),10000);assertNotNull(field);val first=captures().getJSONObject(0).getString("id");fault();field.text="A3 unconfirmed text"
      assertTrue(d.wait(Until.hasObject(By.textContains("Capture storage is unavailable")),10000));tap("Done");assertTrue(d.wait(Until.hasObject(By.text("Latest changes are not protected")),5000));d.findObject(By.res("android:id/button1")).click();assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),5000));assertSame(retained,web());clear()
      var all=captures();assertEquals("",(0 until all.length()).map{all.getJSONObject(it)}.first{it.getString("id")==first}.getJSONObject("body").getString("comment"))
      tap("Reading options");tap("Add review item");field=d.wait(Until.findObject(By.desc("Review comment")),10000);val second=captures().getJSONObject(0).getString("id");fault();field.text="A3 discard unconfirmed text";assertTrue(d.wait(Until.hasObject(By.textContains("Capture storage is unavailable")),10000));clear();tap("Discard draft");assertTrue(d.wait(Until.hasObject(By.text("Discard protected draft?")),5000));d.findObject(By.res("android:id/button1")).click();assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),5000));all=captures();assertFalse((0 until all.length()).any{all.getJSONObject(it).getString("id")==second});assertTrue((0 until all.length()).any{all.getJSONObject(it).getString("id")==first})
    } finally {clear()}
  }
  @Test fun captureWithReducedMotion(){
    val scale=d.executeShellCommand("settings get global transition_animation_scale").trim()
    try{d.executeShellCommand("settings put global transition_animation_scale 0");selectionQueueRetainsReaderAndOriginal()}
    finally{if(scale=="null")d.executeShellCommand("settings delete global transition_animation_scale")else d.executeShellCommand("settings put global transition_animation_scale $scale")}
  }
  @Test fun captureImeAndRotation(){
    val setting=d.executeShellCommand("settings get secure show_ime_with_hard_keyboard").trim()
    try {
      d.executeShellCommand("settings put secure show_ime_with_hard_keyboard 1")
      reader();val retained=web();tap("Reading options");tap("Add review item");val field=d.wait(Until.findObject(By.desc("Review comment")),10000);assertNotNull(field);field.click()
      repeat(50){if(!ime())Thread.sleep(100)};assertTrue("Software IME must actually be visible",ime());field.text="A3 keyboard and rotation"
      d.setOrientationLeft();Thread.sleep(800);d.takeScreenshot(java.io.File(i.targetContext.getExternalFilesDir(null),"a3-ime-landscape.png"));d.dumpWindowHierarchy(java.io.File(i.targetContext.getExternalFilesDir(null),"a3-ime-landscape.xml"));assertTrue(d.wait(Until.hasObject(By.text("Review capture")),5000))
      d.pressBack();repeat(30){if(ime())Thread.sleep(100)};assertFalse("Back must dismiss IME first",ime());assertTrue(d.hasObject(By.text("Review capture")))
      Thread.sleep(300);d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),5000));assertSame("Rotation/IME must retain the reader",retained,web());assertTrue(captures().toString().contains("A3 keyboard and rotation"))
    } finally {d.setOrientationNatural();if(setting=="null")d.executeShellCommand("settings delete secure show_ime_with_hard_keyboard")else d.executeShellCommand("settings put secure show_ime_with_hard_keyboard $setting")}
  }
  @Test fun pdfPageCapturesRenderedFile(){
    reader();val noteWeb=web();val point=JSONObject(js("(()=>{const a=document.querySelector('a.resource[data-resource-id]');a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,id:a.dataset.resourceId}})()"));Thread.sleep(400);val at=IntArray(2);var density=1f;i.runOnMainSync{noteWeb.getLocationOnScreen(at);density=noteWeb.resources.displayMetrics.density};d.click(at[0]+(point.getDouble("x")*density).toInt(),at[1]+(point.getDouble("y")*density).toInt())
    assertTrue(d.wait(Until.hasObject(By.desc("PDF page controls")),15000));tap("PDF page controls");val page=d.wait(Until.findObject(By.desc("PDF page number")),5000);page.text="8";tap("Go to PDF page");assertTrue(d.wait(Until.hasObject(By.text("Page 8 of 12")),15000));val viewer=web();tap("Preview options");tap("Review PDF page 8");val field=d.wait(Until.findObject(By.desc("Review comment")),10000);field.text="A3 PDF page evidence";assertTrue(d.wait(Until.hasObject(By.text("Protected draft on this phone · "+"A3 PDF page evidence".length+"/5000")),10000));tap("Save on this phone");assertTrue(d.wait(Until.hasObject(By.textContains("On this phone · pending sync")),10000));val item=captures().getJSONObject(0);assertEquals(point.getString("id"),item.getJSONObject("body").getString("resourceId"));assertEquals(8,item.getJSONObject("body").getJSONObject("locator").getInt("page"));tap("Done");assertSame(viewer,web());tap("Close preview");assertSame(noteWeb,web())
  }
}
