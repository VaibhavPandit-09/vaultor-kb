package com.vaultorandroid
import android.content.Intent
import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.facebook.react.bridge.*
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.util.concurrent.*
@RunWith(AndroidJUnit4::class)
class UpdateInstallUiTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val i get()=InstrumentationRegistry.getInstrumentation();private val ctx get()=i.targetContext;private val d get()=UiDevice.getInstance(i)
 @org.junit.After fun captureState(){d.takeScreenshot(java.io.File(ctx.getExternalFilesDir(null),"r89-ui-last.png"));d.dumpWindowHierarchy(java.io.File(ctx.getExternalFilesDir(null),"r89-ui-last.xml"))}
 private fun launch(){ctx.startActivity(Intent().setClassName(ctx.packageName,"com.vaultorandroid.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Settings")),30000))}
 private fun module()=VaultorModule(BridgeReactContext(ctx))
 private fun openUpdates(){d.findObject(By.desc("Settings")).click();val updates=d.wait(Until.findObject(By.desc("App updates")),5000);assertNotNull(updates);updates!!.click();assertTrue(d.wait(Until.hasObject(By.text("App updates")),5000))}
 private fun pressAction(label:String){repeat(5){val item=d.findObject(By.desc(label));if(item!=null){item.click();return};d.swipe(d.displayWidth/2,d.displayHeight*4/5,d.displayWidth/2,d.displayHeight/4,20)};fail("Missing visible action "+label)}
 private fun requestInstall(){pressAction("Install verified update");assertTrue(d.wait(Until.hasObject(By.text(java.util.regex.Pattern.compile("(?i)^continue$"))),5000));d.findObject(By.text(java.util.regex.Pattern.compile("(?i)^continue$"))).click()}
 private fun call(action:String):JSONObject {val latch=CountDownLatch(1);var value="{}";var failure=false;module().appUpdates(action,PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failure=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failure);return JSONObject(value)}
 @Test fun utilitiesUseExistingNavigationAndBack(){
  launch()
  d.findObject(By.desc("Settings")).click()
  val export=d.wait(Until.findObject(By.desc("Export")),5000)
  assertNotNull("Export utility action",export);export!!.click()
  assertTrue(d.wait(Until.hasObject(By.text("Export")),5000));Thread.sleep(700)
  d.takeScreenshot(java.io.File(ctx.getExternalFilesDir(null),"r89-export.png"))
  d.pressBack();assertTrue(d.wait(Until.gone(By.text("Export")),5000))
  assertTrue(d.wait(Until.hasObject(By.desc("Settings")),5000))
  openUpdates();Thread.sleep(700)
  d.takeScreenshot(java.io.File(ctx.getExternalFilesDir(null),"r89-updates.png"))
  d.pressBack();assertTrue(d.wait(Until.gone(By.text("App updates")),5000))
  assertTrue(d.wait(Until.hasObject(By.desc("Settings")),5000))
 }
 @Test fun exportSaveCancelAndShareRetainExactVerifiedArtifact(){launch();val saved=JSONObject(java.io.File(ctx.cacheDir,"r89-live-export.json").readText());val id=saved.getString("id");fun export(action:String):String{val latch=CountDownLatch(1);var result="";var failed=false;module().companionExports(action,JSONObject().put("id",id).toString(),PromiseImpl(Callback{result=it[0].toString();latch.countDown()},Callback{failed=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failed);return result};fun artifact():org.json.JSONObject{val rows=org.json.JSONArray(export("list"));return (0 until rows.length()).map{rows.getJSONObject(it)}.single{it.getString("id")==id}};val before=artifact();assertEquals("ready",before.getString("state"));d.findObject(By.desc("Settings")).click();d.findObject(By.desc("Export")).click();pressAction("Save");assertTrue("Save picker did not open: "+artifact().optString("detail"),d.wait(Until.hasObject(By.pkg("com.google.android.documentsui")),15000));d.pressBack();assertTrue("Export did not resume after picker cancellation",d.wait(Until.hasObject(By.text("Export")),5000));assertEquals(before.getString("sha256"),artifact().getString("sha256"));pressAction("Share");assertTrue("Share chooser did not open: "+artifact().optString("detail"),d.wait(Until.hasObject(By.textContains("Share")),15000));d.pressBack();assertEquals("ready",artifact().getString("state"));assertEquals(before.getString("sha256"),artifact().getString("sha256"))}
 @Test fun chooseFinalApkThroughSystemPickerAndVerify(){launch();openUpdates();pressAction("Verify a downloaded APK");assertTrue(d.wait(Until.hasObject(By.pkg("com.google.android.documentsui")),15000));val name="Vaultor-R89-acceptance.apk";var item=d.findObject(By.text(name));if(item==null){val roots=d.findObject(By.desc("Show roots"))?:d.findObject(By.desc("Open navigation drawer"));roots?.click();val downloads=d.wait(Until.findObject(By.text("Downloads")),5000);downloads?.click();item=d.wait(Until.findObject(By.text(name)),10000)};assertNotNull("APK must be visible in the disposable Downloads fixture",item);item!!.click();var state=call("list");repeat(1000){if(state.optString("phase") !in listOf("ready","error")){Thread.sleep(100);state=call("list")}};assertEquals(state.optString("detail"),"ready",state.getString("phase"));assertTrue(state.getJSONObject("candidate").getLong("versionCode")>ctx.packageManager.getPackageInfo(ctx.packageName,0).longVersionCode)}
 @Test fun denyInstallPermissionRetainsVerifiedCandidate(){launch();if(ctx.packageManager.canRequestPackageInstalls())return;openUpdates();requestInstall();assertTrue(d.wait(Until.hasObject(By.pkg("com.android.settings")),15000));d.pressBack();val state=call("list");assertTrue(state.has("candidate"));assertFalse(ctx.packageManager.canRequestPackageInstalls());assertEquals("permission",state.getString("phase"))}
 @Test fun allowPermissionAndConfirmActualAndroidUpgrade(){launch();openUpdates();requestInstall();if(!ctx.packageManager.canRequestPackageInstalls()){assertTrue(d.wait(Until.hasObject(By.pkg("com.android.settings")),15000));val toggle=d.wait(Until.findObject(By.clazz("android.widget.Switch")),5000)?:d.findObject(By.res("android:id/switch_widget"))?:d.findObject(By.checkable(true));assertNotNull("Android installation permission toggle must be reachable",toggle);if(!toggle!!.isChecked)toggle.click();d.pressBack();assertTrue(ctx.packageManager.canRequestPackageInstalls());requestInstall()};var confirm=d.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)^update$"))),10000)?:d.findObject(By.text(java.util.regex.Pattern.compile("(?i)^install$")));assertNotNull("Android update consent required",confirm);confirm!!.click();Thread.sleep(15000);fail("Successful replacement should terminate the old instrumentation process; verify installed version separately")}
}
