package com.vaultorandroid
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.*
import org.json.*
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import java.util.*
import java.util.concurrent.*
@RunWith(AndroidJUnit4::class)
class ImportExperienceTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
 private val ctx get()=instrumentation.targetContext
 private val args get()=InstrumentationRegistry.getArguments()
 private val meta get()=File(ctx.cacheDir,"r7-real-import.json")
 private val store get()=VaultorImports.get(ctx)
 private fun call(block:(PromiseImpl)->Unit):String{val latch=CountDownLatch(1);var value="";var error=false;block(PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{error=true;latch.countDown()}));assertTrue(latch.await(120,TimeUnit.SECONDS));assertFalse("Native operation refused",error);return value}
 private fun module()=VaultorModule(BridgeReactContext(ctx))
 private fun port(m:VaultorModule)=object:VaultorImportDelivery.Port{override fun admit(row:JSONObject)=m.importAdmission(row);override fun request(row:JSONObject,path:String,upload:Boolean)=m.importRequest(row,path,upload)}
 @Test fun pairQueueSwitchSourceAndLoseActualAcknowledgment(){
  val address=args.getString("address")!!;require(address.matches(Regex("https://127\\.0\\.0\\.1:[0-9]+")));if(android.os.Build.VERSION.SDK_INT>=37)instrumentation.uiAutomation.grantRuntimePermission(ctx.packageName,android.Manifest.permission.ACCESS_LOCAL_NETWORK)
  val m=module();val boot=JSONObject(call{m.storage("bootstrap","{}",it)});val profiles=boot.getJSONArray("profiles");if(profiles.length()>=8){val old=(0 until profiles.length()).map{profiles.getJSONObject(it)}.first{it.getString("hostId")!=boot.optString("selected")&&it.getString("address").startsWith("https://127.0.0.1:")};call{m.signOut(old.getString("hostId"),it)}}
  val enrollment=JSONObject(call{m.beginPairing(address,it)});Log.i("VaultorR7Test","R7_PAIR_CODE "+enrollment.getString("code"));var approved=false;repeat(120){if(!approved){approved=JSONObject(call{m.completePairing(it)}).optString("state")=="APPROVED";if(!approved)Thread.sleep(1000)}};assertTrue("Matching owner approval required",approved)
  val host=enrollment.getString("hostId");var active=JSONObject(call{m.activate(host,it)});active=JSONObject(call{m.selectWorkspace(host,active.getString("epoch"),args.getString("workspaceId")!!,args.getString("generation")!!,it)})
  val before=store.rows().map{it.getString("id")}.toSet();store.acquire(UUID.randomUUID().toString(),emptyList(),"# R7 real original\r\nPreserved exact UTF-8 input.");val row=store.rows().single{it.getString("id") !in before};val id=row.getString("id");assertFalse(row.has("source"))
  val scope=JSONArray(listOf(host,args.getString("workspaceId"),args.getString("generation"))).toString();call{m.collectedImports("confirm",JSONObject().put("id",id).put("hostId",host).put("epoch",active.getString("epoch")).put("scope",scope).put("label","R7 captured original source").put("mode","markdown").put("metered",true).toString(),it)}
  var granted=false;repeat(30){if(!granted){val r=JSONObject(call{m.apiFor(host,active.getString("epoch"),"/workspaces","GET",null,null,it)});granted=r.getInt("status")==200&&r.getString("body").contains(args.getString("secondId")!!);if(!granted)Thread.sleep(250)}};assertTrue(granted)
  call{m.selectWorkspace(host,active.getString("epoch"),args.getString("secondId")!!,args.getString("secondGeneration")!!,it)};val selected=JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch")
  val real=port(m);var lost=false;val fault=object:VaultorImportDelivery.Port{override fun admit(row:JSONObject)=real.admit(row);override fun request(row:JSONObject,path:String,upload:Boolean):JSONObject{val r=real.request(row,path,upload);if(row.getString("id")==id&&upload&&r.getInt("status")==200){lost=true;throw java.net.SocketTimeoutException("Synthetic lost actual acknowledgment")};return r}}
  VaultorImportDelivery(store,fault).sync(true);assertTrue(lost);assertEquals("unknown",store.item(id).getString("state"));assertEquals(selected,JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch"));meta.writeText(JSONObject().put("id",id).put("intent",store.item(id).getJSONObject("intent")).put("source",store.item(id).getJSONObject("source")).toString());Log.i("VaultorR7Test","R7_IMPORT_ID $id")
 }
 @Test fun resumeExactAfterDeathWithInactiveSource(){val m=module();val a=JSONObject(meta.readText());val id=a.getString("id");val before=JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch");VaultorImportDelivery(store,port(m)).sync(true);val row=store.item(id);assertEquals("acknowledged",row.getString("state"));assertEquals(a.getJSONObject("intent").toString(),row.getJSONObject("intent").toString());assertEquals(a.getJSONObject("source").toString(),row.getJSONObject("source").toString());assertEquals(before,JSONObject(call{m.storage("bootstrap","{}",it)}).getString("epoch"));store.original(row){};Log.i("VaultorR7Test","R7_IMPORT_ID $id")}
}
