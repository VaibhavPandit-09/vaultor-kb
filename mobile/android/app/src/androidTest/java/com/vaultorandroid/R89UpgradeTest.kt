package com.vaultorandroid
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.*
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.*
import java.io.File
import java.util.concurrent.*
import java.security.MessageDigest
@RunWith(AndroidJUnit4::class)
class R89UpgradeTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
 private fun call(action:(PromiseImpl)->Unit):String{val latch=CountDownLatch(1);var value="";var failed=false;action(PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failed);return value}
 private fun hash(value:String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
 private fun snapshot():JSONObject {val module=VaultorModule(BridgeReactContext(ctx));val imports=VaultorImports.get(ctx);val items=imports.rows().map {row->val item=JSONObject().put("id",row.getString("id"));for(k in listOf("source","intent","sha256","filename","bytes"))if(row.has(k))item.put(k,row.get(k));if(row.has("sha256")){val digest=MessageDigest.getInstance("SHA-256");imports.original(row){digest.update(it)};item.put("recoveredHash",digest.digest().joinToString(""){"%02x".format(it)})};item}.sortedBy {it.getString("id")};val reviews=JSONArray(call{module.reviewCapture("list","{}",it)});val evidence=(0 until reviews.length()).map {reviews.getJSONObject(it).also {it.remove("delivery")}}.sortedBy {it.getString("id")};val result=JSONObject().put("imports",JSONArray(items)).put("reviews",JSONArray(evidence)).put("preferences",JSONObject(call{module.readerPreferences("get","{}",it)})).put("legacy",JSONObject(call{module.legacyRecovery("inventory",it)}));val exportMethod=module.javaClass.methods.firstOrNull {it.name=="companionExports"};if(exportMethod!=null){val exports=JSONArray(call{exportMethod.invoke(module,"list","{}",it)});result.put("exports",JSONArray((0 until exports.length()).map {val row=exports.getJSONObject(it);JSONObject().put("id",row.getString("id")).put("source",row.getJSONObject("source")).put("request",row.getJSONObject("request")).put("sha256",row.optString("sha256"))}.sortedBy {it.getString("id")}))};return result}
 @Test fun seedBeforeInstall(){File(ctx.cacheDir,"r89-upgrade.json").writeText(JSONObject().put("code",ctx.packageManager.getPackageInfo(ctx.packageName,0).longVersionCode).put("state",snapshot()).toString())}
 @Test fun verifyAfterInstall(){val before=JSONObject(File(ctx.cacheDir,"r89-upgrade.json").readText());assertTrue(ctx.packageManager.getPackageInfo(ctx.packageName,0).longVersionCode>before.getLong("code"));val state=before.getJSONObject("state");val now=snapshot();for(key in state.keys())assertEquals("Protected "+key+" changed",hash(state.get(key).toString()),hash(now.get(key).toString()))}
}
