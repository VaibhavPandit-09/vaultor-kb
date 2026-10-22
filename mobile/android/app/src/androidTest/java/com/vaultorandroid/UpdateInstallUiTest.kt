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
 private fun launch(){ctx.startActivity(Intent().setClassName(ctx.packageName,"com.vaultorandroid.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));assertTrue(d.wait(Until.hasObject(By.desc("Settings")),30000))}
 private fun module():VaultorModule {repeat(300){val context=(ctx.applicationContext as MainApplication).reactHost.currentReactContext;val module=context?.getNativeModule(VaultorModule::class.java);if(module!=null)return module;Thread.sleep(100)};error("React native module unavailable")}
 private fun call(action:String):JSONObject {val latch=CountDownLatch(1);var value="{}";var failure=false;module().appUpdates(action,PromiseImpl(Callback{value=it[0].toString();latch.countDown()},Callback{failure=true;latch.countDown()}));assertTrue(latch.await(30,TimeUnit.SECONDS));assertFalse(failure);return JSONObject(value)}
 @Test fun utilitiesUseExistingNavigationAndBack(){launch();d.findObject(By.desc("Settings")).click();assertTrue(d.wait(Until.hasObject(By.text("Settings & tools")),5000));d.findObject(By.desc("Export")).click();assertTrue(d.wait(Until.hasObject(By.text("Export")),5000));Thread.sleep(700);d.takeScreenshot(java.io.File(ctx.getExternalFilesDir(null),"r89-export.png"));d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Settings")),5000));d.findObject(By.desc("Settings")).click();d.findObject(By.desc("App updates")).click();assertTrue(d.wait(Until.hasObject(By.text("App updates")),5000));Thread.sleep(700);d.takeScreenshot(java.io.File(ctx.getExternalFilesDir(null),"r89-updates.png"));d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Settings")),5000));assertTrue(d.hasObject(By.desc("Home")));assertTrue(d.hasObject(By.desc("Library")));assertTrue(d.hasObject(By.desc("Review")))}
 @Test fun chooseFinalApkThroughSystemPickerAndVerify(){launch();call("picker");assertTrue(d.wait(Until.hasObject(By.pkg("com.google.android.documentsui")),15000));val name="Vaultor-R89-acceptance.apk";var item=d.findObject(By.text(name));if(item==null){val roots=d.findObject(By.desc("Show roots"))?:d.findObject(By.desc("Open navigation drawer"));roots?.click();val downloads=d.wait(Until.findObject(By.text("Downloads")),5000);downloads?.click();item=d.wait(Until.findObject(By.text(name)),10000)};assertNotNull("APK must be visible in the disposable Downloads fixture",item);item!!.click();var state=call("list");repeat(1000){if(state.optString("phase") !in listOf("ready","error")){Thread.sleep(100);state=call("list")}};assertEquals(state.optString("detail"),"ready",state.getString("phase"));assertTrue(state.getJSONObject("candidate").getLong("versionCode")>ctx.packageManager.getPackageInfo(ctx.packageName,0).longVersionCode)}
 @Test fun denyInstallPermissionRetainsVerifiedCandidate(){launch();if(ctx.packageManager.canRequestPackageInstalls())return;call("install");assertTrue(d.wait(Until.hasObject(By.pkg("com.android.settings")),15000));d.pressBack();val state=call("list");assertTrue(state.has("candidate"));assertFalse(ctx.packageManager.canRequestPackageInstalls());assertEquals("permission",state.getString("phase"))}
 @Test fun allowPermissionAndConfirmActualAndroidUpgrade(){launch();call("install");if(!ctx.packageManager.canRequestPackageInstalls()){assertTrue(d.wait(Until.hasObject(By.pkg("com.android.settings")),15000));val toggle=d.wait(Until.findObject(By.clazz("android.widget.Switch")),5000)?:d.findObject(By.res("android:id/switch_widget"));assertNotNull("Android installation permission toggle must be reachable",toggle);if(!toggle!!.isChecked)toggle.click();d.pressBack();assertTrue(ctx.packageManager.canRequestPackageInstalls());call("install")};var confirm=d.wait(Until.findObject(By.text("Update")),10000)?:d.findObject(By.text("Install"));assertNotNull("Android update consent required",confirm);confirm!!.click();Thread.sleep(15000);fail("Successful replacement should terminate the old instrumentation process; verify installed version separately")}
}
