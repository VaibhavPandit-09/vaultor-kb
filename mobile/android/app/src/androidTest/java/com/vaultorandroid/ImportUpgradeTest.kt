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
 @Test fun seedR6BeforeInstallOver(){
   assertEquals("0.1.0-alpha.23",ctx.packageManager.getPackageInfo(ctx.packageName,0).versionName)
   val m=VaultorModule(BridgeReactContext(ctx))
   val read=VaultorModule::class.java.getDeclaredMethod("read").apply{isAccessible=true}
   val write=VaultorModule::class.java.getDeclaredMethod("write",JSONObject::class.java).apply{isAccessible=true}
   val state=read.invoke(m) as JSONObject
   val scope=JSONArray(listOf("00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","legacy-generation")).toString()
   val id="00000000-0000-4000-8000-000000000003"
   val legacy=JSONObject().put("scope",scope).put("noteId",id).put("title","Protected legacy upgrade fixture").put("revision","old-revision").put("version","upgrade-v1").put("content",JSONObject().put("type","doc").put("content",JSONArray().put(JSONObject().put("type","paragraph"))))
   state.put("drafts",(state.optJSONObject("drafts")?:JSONObject()).put(scope+"\n"+id,legacy))
   write.invoke(m,state) // Test-only private seeding, never a bridge write or host approval.
   val key=VaultorModule::class.java.getDeclaredMethod("key").apply{isAccessible=true}.invoke(m) as javax.crypto.SecretKey
   val journal=VaultorReviews(File(ctx.noBackupFilesDir,"vaultor-reviews.bin")){key}
   val review=JSONObject(journal.execute("begin",JSONObject().put("scope",scope).put("resourceId",id).put("targetTitle","Upgrade fixture").put("targetType","note").put("baseRevision","r1").put("quote","Retained evidence").put("context","").put("locator",JSONObject().put("kind","resource"))))
   journal.execute("put",JSONObject().put("id",review.getString("id")).put("version",0).put("comment","Protected R6 queue"))
   journal.execute("queue",JSONObject().put("id",review.getString("id")).put("version",1))
   call{m.readerPreferences("put",JSONObject().put("theme","oled").put("size",21).toString(),it)}
   val f=CompanionStoreTest().Fixture(rootOverride=ctx.noBackupFilesDir);val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128));assertEquals("ready",f.download(store).getString("status"))
   val before=snapshot();assertTrue(before.getJSONArray("reviews").length()>0);assertTrue(before.getJSONArray("downloads").length()>0);assertTrue(before.getJSONObject("legacy").getInt("drafts")>0)
   record.writeText(before.toString());assertTrue(record.length()>20)
 }
 @Test fun verifyR7RetainsR6ProtectedState(){assertTrue(ctx.packageManager.getPackageInfo(ctx.packageName,0).longVersionCode>27);val before=JSONObject(record.readText());val after=snapshot();for(key in listOf("reviews","preferences","downloads","legacy"))assertEquals("Protected $key changed across install-over",before.get(key).toString(),after.get(key).toString());assertEquals(before.getJSONObject("bootstrap").getJSONArray("profiles").toString(),after.getJSONObject("bootstrap").getJSONArray("profiles").toString())}
 // Use the exact snapshot assertion immediately after install, before intentional pairing/sync tests.
 private fun digest(value:String)=java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
 @Test fun verifyImmutableR6PayloadAfterInteraction(){val before=JSONObject(record.readText());val after=snapshot();val original=before.getJSONArray("reviews");val now=after.getJSONArray("reviews");assertEquals(original.length(),now.length());for(n in 0 until original.length()){val prior=original.getJSONObject(n);val current=(0 until now.length()).map {now.getJSONObject(it)}.single{it.getString("id")==prior.getString("id")};prior.remove("delivery");current.remove("delivery");assertEquals("Immutable R6 Review "+prior.getString("id"),digest(prior.toString()),digest(current.toString()))};for(key in listOf("preferences","legacy"))assertEquals("Protected R6 "+key,digest(before.get(key).toString()),digest(after.get(key).toString()))}

}
