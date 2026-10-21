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
@RunWith(AndroidJUnit4::class)
class ImportUpgradeTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
 private val record get()=File(ctx.cacheDir,"r7-upgrade-protected-state.json")
 private fun call(run:(PromiseImpl)->Unit):String{val latch=CountDownLatch(1);var value="";var failed=false;run(PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failed);return value}
 private fun snapshot():JSONObject {val m=VaultorModule(BridgeReactContext(ctx));val boot=JSONObject(call{m.storage("bootstrap","{}",it)});boot.remove("epoch");return JSONObject().put("bootstrap",boot).put("reviews",JSONArray(call{m.reviewCapture("list","{}",it)})).put("preferences",JSONObject(call{m.readerPreferences("get","{}",it)})).put("downloads",JSONArray(call{m.companion("list","{}",it)})).put("legacy",JSONObject(call{m.legacyRecovery("inventory",it)}))}
 @Test fun seedR6BeforeInstallOver(){assertEquals("0.1.0-alpha.23",ctx.packageManager.getPackageInfo(ctx.packageName,0).versionName);record.writeText(snapshot().toString());assertTrue(record.length()>20)}
 @Test fun verifyR7RetainsR6ProtectedState(){assertEquals("0.1.0-alpha.24",ctx.packageManager.getPackageInfo(ctx.packageName,0).versionName);val before=JSONObject(record.readText());val after=snapshot();for(key in listOf("reviews","preferences","downloads","legacy"))assertEquals("Protected $key changed across install-over",before.get(key).toString(),after.get(key).toString());assertEquals(before.getJSONObject("bootstrap").getJSONArray("profiles").toString(),after.getJSONObject("bootstrap").getJSONArray("profiles").toString())}
}
