package com.vaultorandroid

import android.content.Intent
import android.util.Log
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
  @Test fun pairingAndEditor() {
    val instrumentation=InstrumentationRegistry.getInstrumentation()
    val address=InstrumentationRegistry.getArguments().getString("fixtureAddress") ?: error("Disposable fixture address is required")
    require(address.startsWith("https://127.0.0.1:")) {"Emulator loopback fixture required"}
    val device=UiDevice.getInstance(instrumentation)
    val context=instrumentation.targetContext
    val intent=context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    assertTrue(device.wait(Until.hasObject(By.text("Pair with host")),30000))
    device.findObject(By.desc("Host HTTPS address")).text=address
    if(device.hasObject(By.pkg("com.google.android.inputmethod.latin"))) device.pressBack()
    device.findObject(By.text("Pair with host")).click()
    // Android 17 local-network runtime permission is tested through its system UI.
    device.wait(Until.hasObject(By.res(java.util.regex.Pattern.compile(".*permissioncontroller:id/permission_allow_button"))),2000)
    if(android.os.Build.VERSION.SDK_INT >= 37) {
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
    // Real keyboard/text, undo and persistence are exercised by the focused host/UI harness.
  }
}
