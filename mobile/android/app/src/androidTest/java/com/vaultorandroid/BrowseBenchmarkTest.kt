package com.vaultorandroid

import android.util.Log
import android.content.Intent
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

/** Explicit disposable Small/Atlas benchmark. Never enumerates bodies or logs credentials. */
@RunWith(AndroidJUnit4::class)
class BrowseBenchmarkTest {
  private fun result(action:(PromiseImpl)->Unit):String {
    val latch=CountDownLatch(1);var value:String?=null;var failed=false
    action(PromiseImpl(Callback {a->value=a[0]?.toString();latch.countDown()},Callback {_ ->failed=true;latch.countDown()}))
    assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse("Native browse rejected",failed);return value!!
  }
  @Test fun boundedMetadataAndSearch() {
    val args=InstrumentationRegistry.getArguments();val expected=args.getString("expectedResources")?.toInt() ?: return
    require(expected==70 || expected==5000)
    val module=VaultorModule(BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext))
    val boot=JSONObject(result {module.storage("bootstrap","{}",it)})
    val host=boot.getString("selected");val epoch=boot.getString("epoch")
    val profile=boot.getJSONArray("profiles").let {p->(0 until p.length()).map {p.getJSONObject(it)}.first {it.getString("hostId")==host}}
    require(profile.getString("address").startsWith("https://127.0.0.1:"))
    fun page(path:String):JSONObject {
      val start=System.nanoTime();val r=JSONObject(result {module.browseApiFor(host,epoch,path,it)})
      assertEquals(200,r.getInt("status"));val p=JSONObject(r.getString("body"));assertTrue(p.getJSONArray("items").length()<=100)
      Log.i("VaultorBrowseBenchmark","PAGE ${path.substringBefore('?')} ms=${(System.nanoTime()-start)/1000000} rows=${p.getJSONArray("items").length()} total=${p.getInt("totalItems")}")
      return p
    }
    repeat(3) {assertEquals(expected,page("/resources?page=0&size=100&q=&sort=updated").getInt("totalItems"))}
    if(expected==5000)assertEquals(100,page("/resources?page=1&size=100&q=&sort=updated").getJSONArray("items").length())
    assertEquals(if(expected==70)40 else 4000,page("/resources?page=0&size=100&q=&type=note&sort=title").getInt("totalItems"))
    val collections=page("/collections?page=0&size=100&q=");assertEquals(if(expected==70)8 else 80,collections.getInt("totalItems"))
    val scope=collections.getJSONArray("items").getJSONObject(0).getString("id")
    val scoped=page("/resources?page=0&size=100&q=&collection=$scope");assertTrue(scoped.getInt("totalItems")<expected)
    assertTrue(page("/organization/pins?page=0&size=100&q=").getInt("totalItems")>0)
    val beacon=if(expected==70)"atlasbeacon0017" else "atlasbeacon0317"
    assertEquals(0,page("/resources?page=0&size=100&q=$beacon").getInt("totalItems"))
    assertTrue(page("/resources/query?page=0&size=100&q=$beacon").getInt("totalItems")>0)
    val instrumentation=InstrumentationRegistry.getInstrumentation();val ctx=instrumentation.targetContext
    val identityResponse=JSONObject(result {module.apiFor(host,epoch,"/workspace/identity","GET",null,null,it)})
    assertEquals(200,identityResponse.getInt("status"))
    val identity=JSONObject(identityResponse.getString("body"));val sessionScope=JSONArray().put(host).put(identity.optString("id",identity.optString("workspaceId"))).put(identity.getString("generation")).toString()
    result {module.storage("putSession",JSONObject().put("scope",sessionScope).put("hostId",host).put("view","browse").put("browse",JSONObject().put("destination","library").put("query","").put("mode","title").put("type","").put("sort","updated").put("page",0).put("scroll",0)).toString(),it)}
    val device=UiDevice.getInstance(instrumentation);val start=System.nanoTime()
    ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    assertTrue(device.wait(Until.hasObject(By.text("$expected resources")),20000))
    Log.i("VaultorBrowseBenchmark","FIRST_USABLE ms=${(System.nanoTime()-start)/1000000} corpus=$expected")
    val scrolling=System.nanoTime()
    repeat(6){device.swipe(700,1800,700,850,12)}
    assertTrue(device.hasObject(By.text("$expected resources")))
    Log.i("VaultorBrowseBenchmark","SIX_SCROLLS ms=${(System.nanoTime()-scrolling)/1000000} corpus=$expected")
  }
}
