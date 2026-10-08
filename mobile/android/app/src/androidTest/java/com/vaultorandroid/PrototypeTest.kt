package com.vaultorandroid

import android.content.Intent
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Runs only with the disposable host address provided by the Windows harness. */
@RunWith(AndroidJUnit4::class)
class PrototypeTest {
  private fun tapBundledLink(device:UiDevice) {
    val instrumentation=InstrumentationRegistry.getInstrumentation();val latch=CountDownLatch(1)
    var x=0;var y=0;var found=false
    instrumentation.runOnMainSync {
      val activity=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).first()
      fun editor(view:View):WebView? {if(view is WebView)return view;if(view is ViewGroup)for(n in 0 until view.childCount){val result=editor(view.getChildAt(n));if(result!=null)return result};return null}
      val web=editor(activity.window.decorView) ?: error("Mounted editor missing")
      val origin=IntArray(2);web.getLocationOnScreen(origin);val density=web.resources.displayMetrics.density
      // WebView145 virtual accessibility nodes differ from WebView133. Read only
      // the fixture link's geometry; UiDevice performs the actual screen touch.
      web.evaluateJavascript("(()=>{const e=[...document.querySelectorAll('.resource-link')].find(e=>e.textContent==='A3 Linked fixture');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()") {value->
        if(value!="null") {val r=JSONObject(value);x=origin[0]+(r.getDouble("x")*density).toInt();y=origin[1]+(r.getDouble("y")*density).toInt();found=true};latch.countDown()
      }
    }
    assertTrue(latch.await(10,TimeUnit.SECONDS));assertTrue("Fixture inline link missing",found);assertTrue(device.click(x,y))
  }
  @Test fun pairingAndEditor() {
    val instrumentation=InstrumentationRegistry.getInstrumentation()
    val address=InstrumentationRegistry.getArguments().getString("fixtureAddress") ?: error("Disposable fixture address is required")
    require(address.startsWith("https://127.0.0.1:")) {"Emulator loopback fixture required"}
    val device=UiDevice.getInstance(instrumentation)
    val context=instrumentation.targetContext
    val intent=context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    if(device.wait(Until.hasObject(By.text("More")),10000)) {
      val hosts=By.text(java.util.regex.Pattern.compile("(?i)hosts"))
      for(attempt in 1..35) {device.findObject(By.text("More"))?.click();if(device.wait(Until.hasObject(hosts),1000))break}
      assertTrue(device.hasObject(hosts));device.findObject(hosts).click()
    } else if(device.hasObject(By.text("Hosts")))device.findObject(By.text("Hosts")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Pair with host")),30000))
    device.findObject(By.desc("Host HTTPS address")).text=address
    if(device.hasObject(By.pkg("com.google.android.inputmethod.latin"))) device.pressBack()
    device.findObject(By.text("Pair with host")).click()
    // Android 17 local-network runtime permission is tested through its system UI.
    device.wait(Until.hasObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_allow_button"))),2000)
    if(android.os.Build.VERSION.SDK_INT >= 37 && device.hasObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_allow_button")))) {
      device.findObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_deny_button")))?.click()
      assertTrue(device.wait(Until.hasObject(By.textContains("Allow local-network access")),10000))
      device.findObject(By.text("Pair with host")).click()
      assertTrue(device.wait(Until.hasObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_allow_button"))),10000))
    }
    device.findObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_allow_button")))?.click()
    assertTrue(device.wait(Until.hasObject(By.textStartsWith("Compare code: ")),30000))
    val code=device.findObject(By.textStartsWith("Compare code: ")).text.substringAfter(": ")
    assertTrue(code.matches(Regex("[0-9]{6}")))
    Log.i("VaultorPrototypeTest","PAIR_CODE $code") // Public comparison code only; never enrollment secret.
    var opened=false
    for (attempt in 1..45) {
      device.findObject(By.text("I approved the matching code"))?.click()
      if(device.wait(Until.hasObject(By.text("A1 Editor fixture")),1000)) {opened=true;break}
    }
    assertTrue("Disposable matching-code host approval did not complete",opened)
    device.findObject(By.text("A1 Editor fixture")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Save")),20000))
    assertTrue(device.wait(Until.hasObject(By.clazz("android.webkit.WebView")),10000))
    Log.i("VaultorPrototypeTest","EDITOR_OPENED")
    device.findObject(By.text("Library")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Return to note")),10000))
    device.findObject(By.text("Recent")).click()
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),10000))
    device.findObject(By.text("All types")).click()
    assertTrue(device.wait(Until.hasObject(By.text("PDFs")),5000))
    device.pressBack() // Picker owns Back; active editor is retained.
    assertTrue(device.wait(Until.hasObject(By.text("Return to note")),5000))
    device.findObject(By.text("Return to note")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Save")),5000))
    tapBundledLink(device)
    assertTrue(device.wait(Until.hasObject(By.text("A3 Linked fixture").clazz("android.widget.TextView")),10000))
    device.pressBack()
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),10000))
    Log.i("VaultorPrototypeTest","LINK_AND_NATIVE_BACK")
    Log.i("VaultorPrototypeTest","BROWSE_BACK_RETAINED_EDITOR")
    // Real keyboard/text, undo and persistence are exercised by the focused host/UI harness.
  }
}
