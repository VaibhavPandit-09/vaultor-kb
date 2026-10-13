package com.vaultorandroid
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
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
@RunWith(AndroidJUnit4::class)
class ReaderUpgradeTest {
 private fun result(allowFailure:Boolean=false,action:(PromiseImpl)->Unit):String {val latch=CountDownLatch(1);var value="";var failure="";action(PromiseImpl(Callback{a->value=a[0]?.toString() ?: "null";latch.countDown()},Callback{a->failure=a[0]?.toString() ?: "Rejected";latch.countDown()}));assertTrue(latch.await(60,TimeUnit.SECONDS));if(!allowFailure)assertEquals("",failure);else assertTrue(failure.isNotEmpty());return value}
 @Test fun seedLegacyBeforeUpgrade(){
 require(android.os.Build.HARDWARE=="ranchu") {"Disposable emulator only"}
 val ctx=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext);val module=VaultorModule(ctx);val scope=JSONArray().put("removed-host").put("former-workspace").put("former-generation").toString();
 for(i in 1..3){val id="00000000-0000-4000-8000-00000000000"+i;val doc=JSONObject().put("type","doc").put("content",JSONArray().put(JSONObject().put("type","paragraph").put("content",JSONArray().put(JSONObject().put("type","text").put("text","Legacy recovery evidence "+i)))));if(i==3)doc.getJSONArray("content").put(JSONObject().put("type","futureBlock").put("attrs",JSONObject().put("evidence","unknown JSON retained")));val d=JSONObject().put("scope",scope).put("noteId",id).put("title","Legacy fixture "+i).put("revision","base").put("version","r1-upgrade-"+i).put("content",doc);if(i==2)d.put("sent",JSONObject().put("version","r1-upgrade-2").put("revision","base").put("title","Legacy fixture 2").put("content",doc));result{module.storage("putDraft",d.toString(),it)}}
 result{module.storage("putCreation",JSONObject().put("scope",scope).put("id","00000000-0000-4000-8000-000000000004").put("title","Uncertain creation").toString(),it)}
 result{module.storage("putOrganization",JSONObject().put("scope",scope).put("key","lifecycle:fixture").put("id","00000000-0000-4000-8000-000000000005").toString(),it)}
 val media=VaultorModule::class.java.getDeclaredMethod("getMedia").apply{isAccessible=true}.invoke(module);val source=File(File(ctx.cacheDir,"media-share").apply{mkdirs()},"legacy-original.txt").apply{writeText("Original upload bytes retained")};val stage=VaultorMedia::class.java.getDeclaredMethod("stage",Uri::class.java).apply{isAccessible=true};stage.invoke(media,FileProvider.getUriForFile(ctx,ctx.packageName+".media",source));
 File(ctx.noBackupFilesDir,"r1-upgrade-unknown.txt").writeText("v2");File(ctx.noBackupFilesDir,"r1-upgrade-count.txt").writeText(JSONArray(result{module.media("list","{}",it)}).length().toString())
 }
 @Test fun upgradeRetainsAndFreezes(){
 val ctx=BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext);val module=VaultorModule(ctx);val b=JSONObject(result{module.storage("bootstrap","{}",it)});val drafts=b.getJSONArray("drafts");assertTrue((0 until drafts.length()).count{drafts.getJSONObject(it).optString("version").startsWith("r1-upgrade-")}==3)
 val before=File(ctx.noBackupFilesDir,"vaultor-state.bin").readBytes();val inventory=JSONObject(result{module.legacyRecovery("inventory",it)});assertTrue(inventory.getInt("drafts")>=3);assertTrue(inventory.getInt("creations")>=1);assertTrue(inventory.getInt("operations")>=1);assertEquals(File(ctx.noBackupFilesDir,"r1-upgrade-count.txt").readText().toInt(),inventory.getInt("inputs"));assertArrayEquals(before,File(ctx.noBackupFilesDir,"vaultor-state.bin").readBytes())
 for(path in listOf("/resources/00000000-0000-4000-8000-000000000001/note","/resources/imports/00000000-0000-4000-8000-000000000001","/resources/lifecycle"))result(true) {module.apiFor("unavailable-host","old",path,"PUT","{}","base",it)}
 result(true) {module.storage("ackDraft","{}",it)}
 for(action in listOf("upload","bind","remove","clipboard","files"))result(true) {module.media(action,"{}",it)}
 result(true) {module.legacyRecovery("export",it)} // No Activity: ZIP is prepared, destination rejected safely.
 val zip=File(ctx.cacheDir,"media-share/Vaultor-legacy-recovery.zip");assertTrue("Recovery ZIP not prepared",zip.exists());java.util.zip.ZipFile(zip).use{z->val json=JSONObject(z.getInputStream(z.getEntry("recovery.json")).bufferedReader().readText());assertFalse(json.has("profiles"));assertFalse(json.has("profile"));assertFalse(json.has("selected"));if(File(ctx.noBackupFilesDir,"r1-upgrade-unknown.txt").exists())assertTrue("Unknown structured content lost",json.toString().contains("futureBlock"));assertTrue("Original staged file missing",z.entries().asSequence().any{it.name.endsWith("legacy-original.txt")});val original=z.entries().asSequence().first{it.name.endsWith("legacy-original.txt")};assertEquals("Original upload bytes retained",z.getInputStream(original).bufferedReader().readText());assertTrue("Readable legacy draft missing",z.entries().asSequence().filter{it.name.startsWith("notes/")}.any{z.getInputStream(it).bufferedReader().readText().contains("Legacy recovery evidence")})};assertArrayEquals(before,File(ctx.noBackupFilesDir,"vaultor-state.bin").readBytes())
 }
}
@RunWith(AndroidJUnit4::class)
class ReaderUiTest {
 @org.junit.After fun capture(){val i=InstrumentationRegistry.getInstrumentation();val d=UiDevice.getInstance(i);d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r1-ui-last.png"));d.dumpWindowHierarchy(File(i.targetContext.getExternalFilesDir(null),"r1-ui-last.xml"));}

 @Test fun readerAndRecovery(){val i=InstrumentationRegistry.getInstrumentation();val d=UiDevice.getInstance(i);i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));for(n in 0..10){d.findObject(By.text("Wait"))?.click();d.findObject(By.text("Allow"))?.click();if(d.hasObject(By.desc("Open navigation").enabled(true)))break;Thread.sleep(500)};assertTrue("Navigation absent",d.wait(Until.hasObject(By.desc("Open navigation").enabled(true)),30000));for(n in 0..8){d.findObject(By.desc("Open navigation"))?.click();if(d.wait(Until.hasObject(By.desc("Library")),1000))break};assertTrue("Library drawer entry absent",d.hasObject(By.desc("Library")));assertFalse(d.hasObject(By.desc("Trash")));assertFalse(d.hasObject(By.desc("New note")));d.findObject(By.desc("Library")).click();assertTrue("Fixture row absent",d.wait(Until.hasObject(By.descContains("A1 Editor fixture")),15000));d.findObject(By.descContains("A1 Editor fixture")).click();assertTrue("Reader header absent",d.wait(Until.hasObject(By.desc("Reading options")),15000));Thread.sleep(1500);assertFalse(d.hasObject(By.desc("Edit")));assertFalse(d.hasObject(By.desc("Save")));assertFalse(d.hasObject(By.desc("Format")));d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r1-reader.png"));d.findObject(By.desc("Reading options")).click();assertTrue("Recovery menu absent",d.wait(Until.hasObject(By.desc("Legacy recovery")),5000));d.findObject(By.desc("Legacy recovery")).click();assertTrue("Recovery export absent",d.wait(Until.hasObject(By.desc("Export legacy recovery")),5000));Thread.sleep(500);d.takeScreenshot(File(i.targetContext.getExternalFilesDir(null),"r1-recovery.png"));d.findObject(By.desc("Export legacy recovery")).click();assertTrue("System export destination absent",d.wait(Until.hasObject(By.pkg("com.google.android.documentsui")),10000));val save=d.wait(Until.findObject(By.res("com.google.android.documentsui","action_menu_save")),5000) ?: d.findObject(By.text(java.util.regex.Pattern.compile("(?i)^save$")));assertNotNull("Save control absent",save);save.click();val replace=d.wait(Until.findObject(By.text("Replace")),1000);replace?.click();assertTrue("ZIP write did not complete",d.wait(Until.hasObject(By.text("Recovery ZIP saved.")),10000));}
}

@RunWith(AndroidJUnit4::class)
class ReaderOfflineTest {
 @Test fun recoveryWithoutHost(){
  require(android.os.Build.HARDWARE=="ranchu")
  val i=InstrumentationRegistry.getInstrumentation();val d=UiDevice.getInstance(i)
  i.targetContext.startActivity(i.targetContext.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  assertTrue("Offline recovery entry absent",d.wait(Until.hasObject(By.desc("Legacy recovery")),15000));d.findObject(By.desc("Legacy recovery")).click()
  assertTrue("Export unavailable without host",d.wait(Until.hasObject(By.desc("Export legacy recovery").enabled(true)),5000));d.findObject(By.desc("Export legacy recovery")).click()
  assertTrue(d.wait(Until.hasObject(By.pkg("com.google.android.documentsui")),10000));val save=d.wait(Until.findObject(By.res("com.google.android.documentsui","action_menu_save")),5000) ?: d.findObject(By.text(java.util.regex.Pattern.compile("(?i)^save$")));assertNotNull(save);save.click();d.wait(Until.findObject(By.text("Replace")),1000)?.click();assertTrue("Offline ZIP write failed",d.wait(Until.hasObject(By.text("Recovery ZIP saved.")),10000))
 }
}
