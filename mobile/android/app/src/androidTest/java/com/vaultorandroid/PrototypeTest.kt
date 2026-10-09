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
import androidx.test.uiautomator.Direction
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
    if(device.wait(Until.hasObject(By.desc("Open navigation")),6000)) {
      for(attempt in 1..20) {device.findObject(By.desc("Open navigation"))?.click();if(device.wait(Until.hasObject(By.desc("Switch workspace or manage connections")),1000))break}
      assertTrue(device.hasObject(By.desc("Switch workspace or manage connections")))
      for(attempt in 1..10) {device.findObject(By.desc("Switch workspace or manage connections"))?.click();if(device.wait(Until.hasObject(By.text("Connect to your workspace")),1000))break}
    }
    for(attempt in 1..8) {if(device.hasObject(By.text("Pair with host")))break;device.findObject(By.scrollable(true))?.scroll(Direction.DOWN,0.75f)}
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
    device.findObject(By.scrollable(true))?.scroll(Direction.DOWN,0.8f)
    var opened=false
    for (attempt in 1..45) {
      device.findObject(By.text("I approved the matching code"))?.click()
      if(device.wait(Until.hasObject(By.text("Your space.")),1000) || device.hasObject(By.text("Edit")) || device.hasObject(By.text("Library"))) {opened=true;break}
      if(attempt==3)device.dumpWindowHierarchy(java.io.File(context.getExternalFilesDir(null),"a5-pair-window.xml"))
    }
    assertTrue("Disposable matching-code host approval did not complete",opened)
    Log.i("VaultorPrototypeTest","APPROVAL_COMPLETE")
    device.findObject(By.text("Browse Library"))?.click()
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),15000))
    if(!device.hasObject(By.text("Edit")))device.findObject(By.text("A1 Editor fixture")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Edit")),20000))
    assertFalse("Read mode must not expose Save",device.hasObject(By.text("Save")))
    assertTrue(device.wait(Until.hasObject(By.clazz("android.webkit.WebView")),10000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a5-reading.png"))
    device.findObject(By.text("Edit")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Save")),5000))
    assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.inputmethod.latin")),8000))
    device.executeShellCommand("input text A5Typed")
    assertTrue(device.wait(Until.hasObject(By.textContains("protected on this device")),10000))
    device.findObject(By.text("undo")).click()
    device.findObject(By.text("Save")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Saved")),15000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a5-edit-keyboard.png"))
    device.pressBack() // IME first; editing still owns the document.
    assertTrue(device.wait(Until.hasObject(By.text("Save")),5000))
    device.pressBack() // Then reading, without navigating away.
    assertTrue(device.wait(Until.hasObject(By.text("Edit")),5000))
    assertTrue(device.hasObject(By.text("A1 Editor fixture")))
    Log.i("VaultorPrototypeTest","EDITOR_OPENED_READ_EDIT_BACK")
    device.findObject(By.desc("Open navigation")).click()
    assertTrue(device.wait(Until.hasObject(By.desc("View all recent")),5000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a5-drawer.png"))
    device.findObject(By.desc("View all recent")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Return to note")),10000))
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),10000))
    device.findObject(By.text("Filters")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Type · All types")),5000))
    assertFalse("Short options must not open IME",device.hasObject(By.pkg("com.google.android.inputmethod.latin")))
    device.findObject(By.text("Type · All types")).click()
    assertTrue(device.wait(Until.hasObject(By.text("PDFs")),5000))
    device.pressBack(); if(device.hasObject(By.text("PDFs")))device.pressBack()
    assertTrue(device.wait(Until.hasObject(By.text("Return to note")),5000))
    device.findObject(By.text("Return to note")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Edit")),5000))
    tapBundledLink(device)
    assertTrue(device.wait(Until.hasObject(By.text("A3 Linked fixture").clazz("android.view.View")),10000))
    device.pressBack()
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),10000))
    Log.i("VaultorPrototypeTest","LINK_AND_NATIVE_BACK")
    Log.i("VaultorPrototypeTest","BROWSE_BACK_RETAINED_EDITOR")
    // Real keyboard/text, undo and persistence are exercised by the focused host/UI harness.
  }
}
