package com.vaultorandroid
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Explicit emulator/disposable pinned HTTPS only. No phone, tokens or CA output. */
@RunWith(AndroidJUnit4::class)
class CompanionExperienceTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val i get()=InstrumentationRegistry.getInstrumentation()
 private fun result(refused:Boolean=false,f:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var failed=false;f(PromiseImpl(Callback{v->value=v[0]?.toString()?:"null";latch.countDown()},Callback{v->failed=true;value=v[0]?.toString()?:"Rejected";latch.countDown()}));assertTrue(latch.await(90,TimeUnit.SECONDS));assertEquals(value,refused,failed);return value}
 private fun js(code:String):String {val latch=CountDownLatch(1);var value="null";i.runOnMainSync {fun find(v:View):WebView?{if(v is WebView)return v;if(v is ViewGroup)for(n in v.childCount-1 downTo 0){val w=find(v.getChildAt(n));if(w!=null)return w};return null};val web=android.view.inspector.WindowInspector.getGlobalWindowViews().asReversed().firstNotNullOfOrNull{find(it)}?:error("Reader WebView absent");web.evaluateJavascript(code){value=it;latch.countDown()}};assertTrue(latch.await(10,TimeUnit.SECONDS));return value}
 private fun waitJs(code:String){repeat(60){try {if(js(code)=="true")return}catch(e:IllegalStateException){if(e.message!="Reader WebView absent")throw e};Thread.sleep(250)};fail(code)}
 private fun tap(node:UiObject2){val p=node.visibleCenter;UiDevice.getInstance(i).swipe(p.x,p.y,p.x,p.y,12);Thread.sleep(200)}
 private fun module()=VaultorModule(BridgeReactContext(i.targetContext))
 private fun source(m:VaultorModule):JSONObject {val b=JSONObject(result{m.storage("bootstrap","{}",it)});val host=b.getString("selected");val p=(0 until b.getJSONArray("profiles").length()).map {b.getJSONArray("profiles").getJSONObject(it)}.first {it.getString("hostId")==host};require(p.getString("address").startsWith("https://127.0.0.1:"));return JSONObject().put("hostId",host).put("epoch",b.getString("epoch")).put("workspaceId",p.optString("workspaceId"))}
 private fun get(m:VaultorModule,a:JSONObject,path:String):JSONObject {repeat(40){val r=JSONObject(result{m.apiFor(a.getString("hostId"),a.getString("epoch"),path,"GET",null,null,it)});if(r.getInt("status")==409){Thread.sleep(250)}else {assertEquals(r.toString(),200,r.getInt("status"));return JSONObject(r.getString("body"))}};error("Busy")}
 private fun download(m:VaultorModule,a:JSONObject):JSONObject {val id=JSONObject(result{m.companion("start",a.toString(),it)}).getString("id");repeat(1500){val list=JSONArray(result{m.companion("list","{}",it)});val job=(0 until list.length()).map {list.getJSONObject(it)}.first {it.getString("id")==id};if(job.getString("status")!="downloading" && !job.optBoolean("workerActive")){assertEquals(job.toString(),"ready",job.getString("status"));return job};Thread.sleep(100)};error("Checkpoint timeout")}
 @Test fun pinnedHttpsDownloadAndSeed() {
   val m=module();val a=source(m);val identity=get(m,a,"/workspace/identity");val scope=JSONArray(listOf(a.getString("hostId"),identity.getString("id"),identity.getString("generation"))).toString();a.put("scope",scope)
   assertTrue(get(m,a,"/organization/pins?page=0&size=12&q=").has("items"))
   val quick=JSONObject(result{m.quickApiFor(a.getString("hostId"),a.getString("epoch"),"/organization/pins?page=0&size=12&q=",it)});assertEquals(200,quick.getInt("status"));result(true){m.quickApiFor(a.getString("hostId"),a.getString("epoch"),"/resources?page=0&size=100",it)}
   result{m.companion("policyPut",JSONObject().put("budgetMiB",128).put("metered",true).put("lowBattery",true).toString(),it)}
   a.put("selection",JSONObject().put("scope","workspace").put("ids",JSONArray()).put("dependencies","linked").put("files","readable"));a.put("name","R4 offline fixture")
   val estimate=JSONObject(result{m.companionEstimate(a.toString(),it)});assertTrue(estimate.getInt("resources")>=8)
   val first=download(m,a);assertTrue(first.getInt("done")>=8)
   val args=InstrumentationRegistry.getArguments();val note=args.getString("readerId")!!;val saved=get(m,a,"/resources/$note")
   val local=JSONObject(result{m.companion("read",JSONObject(a.toString()).put("path","/resources/$note").toString(),it)});assertEquals(saved.getJSONObject("content").toString(),local.getJSONObject("content").toString())
   val matches=JSONObject(result{m.companion("read",JSONObject(a.toString()).put("path","/resources/query?q=A3%20Linked%20fixture&type=note").toString(),it)}).getJSONArray("items");assertTrue((0 until matches.length()).any {matches.getJSONObject(it).getString("title")=="R2 Rich reading"})
   val fixture=JSONObject(a.toString()).put("noteId",note).put("pdf",args.getString("pdfId")).put("image",args.getString("imageId"));File(i.targetContext.noBackupFilesDir,"r4-offline-fixture.json").writeText(fixture.toString())
   result{m.companion("activate",JSONObject().put("scope",scope).toString(),it)}
   result{m.storage("putSession",JSONObject().put("scope",scope).put("hostId",a.getString("hostId")).put("noteId",note).put("view","note").put("localOnly",true).put("position",JSONObject().put("anchor",0).put("head",0).put("scroll",0)).put("journey",JSONObject().put("visits",JSONArray().put(JSONObject().put("id",note).put("title",saved.getString("title")))).put("cursor",0)).toString(),it)}
 }
 @Test fun disconnectedColdReaderAndMedia() {
   val fixture=JSONObject(File(i.targetContext.noBackupFilesDir,"r4-offline-fixture.json").readText());val m=module();val a=source(m).put("scope",fixture.getString("scope")).put("offline",true)
   val available=JSONObject(result{m.companion("available",a.toString(),it)});assertEquals(fixture.getString("scope"),available.getString("scope"));assertFalse(available.getBoolean("locked"))
   assertTrue(JSONObject(result{m.companion("read",JSONObject(a.toString()).put("path","/resources?page=0&size=100").toString(),it)}).getInt("totalItems")>=8)
   val pdf=JSONObject(result{m.media("preview",JSONObject(a.toString()).put("resourceId",fixture.getString("pdf")).put("mime","application/pdf").put("page",7).put("renderScale",2).toString(),it)});assertEquals(12,pdf.getInt("pages"));assertEquals(7,pdf.getInt("page"))
   val image=JSONObject(result{m.media("preview",JSONObject(a.toString()).put("resourceId",fixture.getString("image")).put("mime","image/png").toString(),it)});assertEquals(1600,image.getInt("width"));assertEquals(1000,image.getInt("height"))
   val d=UiDevice.getInstance(i);i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),30000));waitJs("!!document.querySelector('article p')");waitJs("document.documentElement.scrollWidth<=innerWidth+1")
   // A very long code block must own its full background inside a local scroll region.
   js("(()=>{const box=document.createElement('div');box.className='overflow';const p=document.createElement('pre');p.textContent='https://example.com/'+('long/path/'.repeat(100));box.append(p);document.querySelector('article').append(box);return true})()")
   waitJs("(()=>{const p=[...document.querySelectorAll('pre')].at(-1), b=p.parentElement;return p.getBoundingClientRect().width>=p.scrollWidth-1 && b.scrollWidth>b.clientWidth && document.documentElement.scrollWidth<=innerWidth+1})()")
   tap(d.findObject(By.desc("Open navigation")));assertTrue(d.wait(Until.hasObject(By.desc("Appearance & reading")),5000));assertFalse(d.hasObject(By.textContains("Host unavailable, access refused")))
   tap(d.findObject(By.desc("Appearance & reading")));assertTrue(d.wait(Until.hasObject(By.desc("OLED")),5000));tap(d.findObject(By.desc("OLED")));tap(d.findObject(By.desc("Done")));waitJs("document.documentElement.dataset.theme==='oled'")
   d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r4-offline-oled.png"));
   tap(d.findObject(By.desc("Open navigation")));assertTrue(d.wait(Until.hasObject(By.desc("Offline downloads")),5000));tap(d.findObject(By.desc("Offline downloads")));assertTrue(d.wait(Until.hasObject(By.desc("Read downloaded")),5000));d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r4-downloads.png"));tap(d.findObject(By.desc("Done")))
 }
 @Test fun verifiedRevocationLocksColdCopy() {
   val fixture=JSONObject(File(i.targetContext.noBackupFilesDir,"r4-offline-fixture.json").readText());val m=module();val a=source(m).put("scope",fixture.getString("scope"));val r=JSONObject(result{m.apiFor(a.getString("hostId"),a.getString("epoch"),"/workspace/identity","GET",null,null,it)});assertTrue(r.getInt("status") in listOf(401,403,404));val available=JSONObject(result{m.companion("available",a.toString(),it)});assertTrue(available.getBoolean("locked"));result(true){m.companion("read",JSONObject(a.toString()).put("path","/resources").toString(),it)}
   val d=UiDevice.getInstance(i);i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.textContains("Downloaded source is locked")),30000));assertFalse(d.hasObject(By.desc("Reading options")))
 }
 @Test fun crashDuringRefresh() {
   val fixture=JSONObject(File(i.targetContext.noBackupFilesDir,"r4-offline-fixture.json").readText());val m=module();val a=source(m).put("scope",fixture.getString("scope")).put("selection",fixture.getJSONObject("selection"));val before=JSONObject(result{m.companion("available",a.toString(),it)}).getString("active")
   val id=JSONObject(result{m.companion("start",a.toString(),it)}).getString("id");val dir=File(i.targetContext.noBackupFilesDir,"companions-v1/$id")
   repeat(10000){val part=dir.listFiles()?.firstOrNull {it.name.endsWith(".bin.part") && it.length() in 262144..(31L*1024*1024)}
     if(part!=null){File(i.targetContext.noBackupFilesDir,"r4-interrupted.json").writeText(JSONObject().put("id",id).put("prior",before).put("bytes",part.length()).toString());android.os.Process.killProcess(android.os.Process.myPid());Thread.sleep(10000)};Thread.sleep(2)};fail("No mid-payload interruption occurred")
 }
 @Test fun resumeAfterProcessDeath() {
   val fixture=JSONObject(File(i.targetContext.noBackupFilesDir,"r4-offline-fixture.json").readText());val interrupted=JSONObject(File(i.targetContext.noBackupFilesDir,"r4-interrupted.json").readText());assertTrue(interrupted.getLong("bytes")>0)
   val m=module();val a=source(m).put("scope",fixture.getString("scope")).put("selection",fixture.getJSONObject("selection"));val before=JSONObject(result{m.companion("available",a.toString(),it)});assertEquals(interrupted.getString("prior"),before.getString("active"))
   val resumed=download(m,a);assertEquals(interrupted.getString("id"),resumed.getString("id"));assertEquals(resumed.getString("id"),JSONObject(result{m.companion("available",a.toString(),it)}).getString("active"))
 }}
