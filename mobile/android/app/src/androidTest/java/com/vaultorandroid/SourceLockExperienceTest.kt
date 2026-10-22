package com.vaultorandroid

import android.content.Intent
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.*

/** Normal pairing is performed by ImportExperienceTest against the disposable host. */
@RunWith(AndroidJUnit4::class)
class SourceLockExperienceTest {
    init {require(android.os.Build.HARDWARE=="ranchu")}
    private val i get()=InstrumentationRegistry.getInstrumentation()
    private val ctx get()=i.targetContext
    private val d get()=UiDevice.getInstance(i)
    private val args get()=InstrumentationRegistry.getArguments()
    private val marker get()=File(ctx.cacheDir,"source-lock-live.json")
    private fun module()=VaultorModule(BridgeReactContext(ctx))
    private fun call(block:(PromiseImpl)->Unit):String {val done=CountDownLatch(1);var value="";var error="";block(PromiseImpl(Callback{value=it[0].toString();done.countDown()},Callback{error=it[0].toString();done.countDown()}));assertTrue(done.await(60,TimeUnit.SECONDS));assertEquals("",error);return value}
    private fun exports(m:VaultorModule)=JSONArray(call{m.companionExports("list","{}",it)})
    private fun await(m:VaultorModule,id:String):JSONObject {repeat(300){val rows=exports(m);val row=(0 until rows.length()).map{rows.getJSONObject(it)}.single{it.getString("id")==id};if(row.optString("state") in listOf("ready","error"))return row;Thread.sleep(100)};error("Export timeout")}
    @Test fun prepareRetainedReader() {
        val m=module();val boot=JSONObject(call{m.storage("bootstrap","{}",it)});val host=boot.getString("selected")
        var active=JSONObject(call{m.activate(host,it)});active=JSONObject(call{m.selectWorkspace(host,active.getString("epoch"),args.getString("workspaceId")!!,args.getString("generation")!!,it)})
        val scope=JSONArray(listOf(host,args.getString("workspaceId"),args.getString("generation"))).toString()
        val input=JSONObject(active.toString()).put("scope",scope).put("name","Source-lock live fixture").put("selection",JSONObject().put("scope","workspace").put("ids",JSONArray()).put("dependencies","linked").put("files","readable"))
        call{m.companion("policyPut",JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128).toString(),it)}
        val id=JSONObject(call{m.companion("start",input.toString(),it)}).getString("id");var ready=false
        repeat(400){if(!ready){val jobs=JSONArray(call{m.companion("list","{}",it)});val row=(0 until jobs.length()).map{jobs.getJSONObject(it)}.single{it.getString("id")==id};ready=row.optString("status")=="ready"&&!row.optBoolean("workerActive");if(!ready)Thread.sleep(100)}};assertTrue(ready)
        val selected=JSONObject(call{m.companion("activate",JSONObject().put("scope",scope).toString(),it)})
        call{m.storage("putSession",JSONObject().put("scope",scope).put("hostId",host).put("noteId",args.getString("noteId")).put("view","note").put("localOnly",true).toString(),it)}
        marker.writeText(JSONObject(selected.toString()).put("scope",scope).toString())
    }
    @Test fun verifiedExportRefusalHidesOpenReader() {
        ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        assertTrue(d.wait(Until.hasObject(By.desc("Reading options")),30000))
        val react=(ctx.applicationContext as MainApplication).reactHost.currentReactContext as ReactApplicationContext
        val m=VaultorModule(react);val saved=JSONObject(marker.readText());val boot=JSONObject(call{m.storage("bootstrap","{}",it)})
        val signal=File(ctx.getExternalFilesDir(null),"r89-fixtures/grant-removed.ready");signal.parentFile!!.mkdirs();signal.delete()
        Log.i("VaultorSourceLockTest","SOURCE_LOCK_READY")
        repeat(600){if(!signal.exists())Thread.sleep(100)};assertTrue("Owner grant-removal handshake required",signal.exists()) // Owner removes only this fixture's workspace grant through its normal API.
        val input=JSONObject(saved.toString()).put("epoch",boot.getString("epoch")).put("offline",false).put("request",JSONObject().put("scope","workspace").put("format","zip").put("ids",JSONArray()).put("depth",0))
        val id=JSONObject(call{m.companionExports("start",input.toString(),it)}).getString("id")
        val refused=await(m,id);assertEquals(refused.optString("detail"),"error",refused.getString("state"));Log.i("VaultorSourceLockTest","REFUSAL "+refused.optString("detail"))
        assertTrue(refused.optString("detail"),d.wait(Until.gone(By.desc("Reading options")),10000))
        val available=JSONObject(call{m.companion("available",JSONObject(saved.toString()).put("epoch",boot.getString("epoch")).toString(),it)})
        assertTrue(available.getBoolean("locked"))
    }
    @Test fun lockedSourceCannotRestoreOrExportAfterProcessRestart() {
        val m=module();val saved=JSONObject(marker.readText());val boot=JSONObject(call{m.storage("bootstrap","{}",it)});saved.put("epoch",boot.getString("epoch"))
        assertTrue(JSONObject(call{m.companion("available",saved.toString(),it)}).getBoolean("locked"))
        val result=CountDownLatch(1);var refused=false
        m.companion("read",JSONObject(saved.toString()).put("path","/resources/"+args.getString("noteId")).toString(),PromiseImpl(Callback{result.countDown()},Callback{refused=true;result.countDown()}));assertTrue(result.await(30,TimeUnit.SECONDS));assertTrue(refused)
        val input=JSONObject(saved.toString()).put("offline",true).put("request",JSONObject().put("scope","downloaded").put("format","partial").put("ids",JSONArray()).put("depth",0))
        val id=JSONObject(call{m.companionExports("start",input.toString(),it)}).getString("id");assertEquals("error",await(m,id).getString("state"))
        ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        assertTrue(d.wait(Until.hasObject(By.desc("Settings")),30000));assertFalse(d.hasObject(By.desc("Reading options")))
    }
}
