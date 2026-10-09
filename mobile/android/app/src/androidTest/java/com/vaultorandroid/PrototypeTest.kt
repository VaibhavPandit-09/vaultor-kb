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
    if(InstrumentationRegistry.getArguments().getString("reuseApproval")!="true") {
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
      if(attempt==3)device.dumpWindowHierarchy(java.io.File(context.getExternalFilesDir(null),"a6-pair-window.xml"))
    }
    assertTrue("Disposable matching-code host approval did not complete",opened)
    Log.i("VaultorPrototypeTest","APPROVAL_COMPLETE")
    }
    if(InstrumentationRegistry.getArguments().getString("reuseApproval")=="true" && !device.hasObject(By.text("Browse Library"))) {
      assertTrue(device.wait(Until.hasObject(By.desc("Open navigation")),30000))
      device.findObject(By.desc("Open navigation")).click()
      assertTrue(device.wait(Until.hasObject(By.desc("Library")),5000))
      device.findObject(By.desc("Library")).click()
    }
    device.findObject(By.text("Browse Library"))?.click()
    assertTrue(device.wait(Until.hasObject(By.text("A1 Editor fixture")),15000))
    if(!device.hasObject(By.text("Edit")))device.findObject(By.text("A1 Editor fixture")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Edit")),20000))
    assertFalse("Read mode must not expose writing tools",device.hasObject(By.text("Insert")))
    assertTrue(device.wait(Until.hasObject(By.clazz("android.webkit.WebView")),10000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a6-reading.png"))
    device.findObject(By.text("Edit")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Insert")),5000))
    assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.inputmethod.latin")),8000))
    device.executeShellCommand("input text A6Typed")
    assertTrue(device.wait(Until.hasObject(By.text("Saved to host")),10000))
    device.findObject(By.text("Format")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Bold")),5000))
    device.findObject(By.text("Bold")).click()
    device.findObject(By.text("Undo")).click()
    Thread.sleep(800)
    assertTrue(device.wait(Until.hasObject(By.text("Saved to host")),15000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a6-edit-keyboard.png"))
    if(device.hasObject(By.pkg("com.google.android.inputmethod.latin"))) {
      device.pressBack() // IME first, when currently visible.
      assertTrue(device.wait(Until.hasObject(By.text("Insert")),5000))
    }
    device.pressBack() // Then reading, without navigating away.
    assertTrue(device.wait(Until.hasObject(By.text("Edit")),5000))
    assertTrue(device.hasObject(By.text("A1 Editor fixture")))
    Log.i("VaultorPrototypeTest","EDITOR_OPENED_READ_EDIT_BACK")
    device.findObject(By.desc("Open navigation")).click()
    assertTrue(device.wait(Until.hasObject(By.desc("View all recent")),5000))
    device.takeScreenshot(java.io.File(context.getExternalFilesDir(null),"a6-drawer.png"))
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
    device.findObject(By.desc("Open navigation")).click()
    assertTrue(device.wait(Until.hasObject(By.desc("Home")),5000))
    device.findObject(By.desc("Home")).click()
    assertTrue(device.wait(Until.hasObject(By.text("New note")),5000))
    device.findObject(By.text("New note")).click()
    assertTrue(device.wait(Until.hasObject(By.desc("Note title")),5000))
    device.findObject(By.desc("Note title")).text="A6 quick capture"
    device.findObject(By.text("Create note")).click()
    assertTrue(device.wait(Until.hasObject(By.text("Insert")),15000))
    assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.inputmethod.latin")),8000))
    device.executeShellCommand("input text NewCapture")
    assertTrue(device.wait(Until.hasObject(By.text("Saved to host")),15000))
    assertFalse(device.hasObject(By.text("Save")))
    Log.i("VaultorPrototypeTest","QUICK_CAPTURE_AUTOSAVED")
    var terminated=false
    instrumentation.runOnMainSync {
      val activity=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).first()
      fun web(view:View):WebView? {if(view is WebView)return view;if(view is ViewGroup)for(i in 0 until view.childCount){val found=web(view.getChildAt(i));if(found!=null)return found};return null}
      terminated=web(activity.window.decorView)?.webViewRenderProcess?.terminate()==true
    }
    assertTrue("Owned editor renderer did not terminate",terminated)
    assertTrue(device.wait(Until.hasObject(By.text("Reopen editor")),15000))
    device.findObject(By.text("Reopen editor")).click()
    assertTrue(device.wait(Until.gone(By.text("Reopen editor")),15000))
    assertTrue(device.wait(Until.hasObject(By.text("Insert")),15000))
    assertTrue(device.wait(Until.gone(By.text("Editor stopped. Protected drafts remain. Reopen the editor.")),15000))
    Log.i("VaultorPrototypeTest","RENDERER_REOPENED")
    // Real keyboard/text, undo and persistence are exercised by the focused host/UI harness.
  }
}
