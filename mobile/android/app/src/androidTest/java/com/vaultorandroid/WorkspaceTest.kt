package com.vaultorandroid

import android.content.Intent
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Explicit disposable HTTPS fixture and emulator only. Never prints credentials. */
@RunWith(AndroidJUnit4::class)
class WorkspaceTest {
 private fun result(action:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var failure="";action(PromiseImpl(Callback {args->value=args[0]?.toString() ?: "null";latch.countDown()},Callback {args->failure=args[0]?.toString() ?: "Rejected";latch.countDown()}));assertTrue(latch.await(60,TimeUnit.SECONDS));assertEquals("",failure);return value}
 private fun refused(action:(PromiseImpl)->Unit){val latch=CountDownLatch(1);var rejected=false;action(PromiseImpl(Callback {latch.countDown()},Callback {rejected=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertTrue(rejected)}
 @Test fun pairedWorkspaceIsolationAndSelector(){
  val instrumentation=InstrumentationRegistry.getInstrumentation();val ctx=BridgeReactContext(instrumentation.targetContext);val module=VaultorModule(ctx);val args=InstrumentationRegistry.getArguments();val address=args.getString("fixtureAddress")!!;require(address.startsWith("https://127.0.0.1:"));val note=args.getString("noteId")!!;val file=args.getString("fileId")!!;val target=args.getString("workspaceId")!!
  val reuse=args.getString("reuseApproval")=="true";val enrollment=if(reuse)JSONObject().put("hostId",JSONObject(result {module.storage("bootstrap","{}",it)}).getString("selected"))else JSONObject(result {module.beginPairing(address,it)});if(!reuse)Log.i("VaultorWorkspaceTest","Comparison code: "+enrollment.getString("code"))
  var approved=reuse;for(n in 0..119){if(reuse)break;val status=JSONObject(result {module.completePairing(it)});if(status.optString("state")=="APPROVED"){approved=true;break};Thread.sleep(2000)};assertTrue("Matching-code approval required",approved)
  val host=enrollment.getString("hostId");var epoch=JSONObject(result {module.activate(host,it)}).getString("epoch")
  fun raw(path:String):JSONObject {for(n in 0..20){val reply=JSONObject(result {module.apiFor(host,epoch,path,"GET",null,null,it)});if(reply.getInt("status")!=409 || n==20)return reply;Thread.sleep(250)};error("Busy")}
  fun get(path:String):JSONObject {val reply=raw(path);assertEquals(reply.toString(),200,reply.getInt("status"));return JSONObject(reply.getString("body"))}
  val first=get("/workspace/identity");val listed=raw("/workspaces");assertEquals(2,JSONArray(listed.getString("body")).length());assertEquals("A1 Editor fixture",get("/resources/$note").getString("title"))
  fun preview(identity:JSONObject):String {val scope=JSONArray().put(host).put(identity.getString("id")).put(identity.getString("generation")).toString();return JSONObject(result {module.media("preview",JSONObject().put("hostId",host).put("epoch",epoch).put("scope",scope).put("resourceId",file).put("title","scope.txt").put("mime","text/plain").toString(),it)}).getString("text")}
  assertEquals("default-workspace-bytes",preview(first));val detail=get("/workspaces/$target");val old=epoch
  val next=JSONObject(result {module.selectWorkspace(host,epoch,target,detail.getString("generation"),it)});epoch=next.getString("epoch");assertNotEquals(old,epoch)
  assertEquals("W2 Same ID second note",get("/resources/$note").getString("title"));assertEquals("second-workspace-bytes",preview(get("/workspace/identity")))
  refused {module.apiFor(host,old,"/resources/$note","GET",null,null,it)}
  refused {module.selectWorkspace(host,epoch,first.getString("id"),"wrong-generation",it)};assertEquals(target,get("/workspace/identity").getString("id"))
  val restarted=VaultorModule(ctx);val persisted=JSONObject(result {restarted.storage("bootstrap","{}",it)}).getJSONArray("profiles");assertEquals(target,(0 until persisted.length()).map{persisted.getJSONObject(it)}.first{it.getString("hostId")==host}.getString("workspaceId"))
  epoch=JSONObject(result {module.selectWorkspace(host,epoch,first.getString("id"),first.getString("generation"),it)}).getString("epoch")
 }
}

@RunWith(AndroidJUnit4::class)
class WorkspaceSelectorTest {
 @Test fun selector(){
  val instrumentation=InstrumentationRegistry.getInstrumentation();val device=UiDevice.getInstance(instrumentation);val intent=instrumentation.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);instrumentation.targetContext.startActivity(intent)
  assertTrue("Navigation button missing",device.wait(Until.hasObject(By.desc("Open navigation").enabled(true)),30000));
  for(n in 0..10){device.findObject(By.desc("Open navigation"))?.click();if(device.wait(Until.hasObject(By.desc("Switch workspace or manage connections")),1000))break}
  assertTrue("Connection entry missing",device.hasObject(By.desc("Switch workspace or manage connections")));device.findObject(By.desc("Switch workspace or manage connections")).click();
  assertTrue("Workspace choice missing",device.wait(Until.hasObject(By.text("W2 Second workspace")),15000));device.takeScreenshot(java.io.File(instrumentation.targetContext.getExternalFilesDir(null),"w2-workspaces.png"));device.findObject(By.text("W2 Second workspace")).click();
  assertTrue("Switch did not dismiss selector",device.wait(Until.hasObject(By.desc("Open navigation").enabled(true)),15000));
 }
}
