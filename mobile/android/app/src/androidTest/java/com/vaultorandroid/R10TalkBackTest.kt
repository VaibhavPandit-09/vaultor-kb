package com.vaultorandroid

import android.app.UiAutomation
import android.content.Intent
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

/** Stock emulator TalkBack focus observation, not spoken/OEM/physical acceptance. */
@RunWith(AndroidJUnit4::class)
class R10TalkBackTest {
  @Test fun actualServiceFocusTraversal() {
    require(android.os.Build.HARDWARE=="ranchu")
    val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
    val a=i.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
    fun shell(command:String)=ParcelFileDescriptor.AutoCloseInputStream(a.executeShellCommand(command)).bufferedReader().use{it.readText().trim()}
    val service="com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
    val previous=shell("settings get secure enabled_accessibility_services")
    require(previous=="null"||previous.matches(Regex("[A-Za-z0-9_./:]*")))
    val enabled=shell("settings get secure accessibility_enabled");require(enabled in listOf("null","0","1"))
    val focus=CopyOnWriteArrayList<String>()
    a.setOnAccessibilityEventListener {e->if(e.eventType==AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED&&e.packageName?.toString()=="com.vaultor.app"){
      val source=e.source;val label=source?.contentDescription?.toString()?:source?.text?.toString()?:e.text.joinToString(" ")
      if(label.isNotBlank())focus.add(label.take(160))
    }}
    fun launch(){ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage("com.vaultor.app")!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));Thread.sleep(1500)}
    fun closeTutorial(n:AccessibilityNodeInfo?):Boolean {if(n==null)return false;if(n.packageName?.toString()=="com.google.android.marvin.talkback"&&n.text?.toString() in listOf("Close","Skip tutorial","Exit tutorial"))return n.performAction(AccessibilityNodeInfo.ACTION_CLICK);for(j in 0 until n.childCount)if(closeTutorial(n.getChild(j)))return true;return false}
    try {
      val list=if(previous in listOf("null",""))service else if(previous.split(':').contains(service))previous else "$previous:$service"
      shell("settings put secure enabled_accessibility_services '$list'");shell("settings put secure accessibility_enabled 1");Thread.sleep(5000)
      repeat(3){closeTutorial(a.rootInActiveWindow);Thread.sleep(300)};launch();focus.clear()
      val metrics=ctx.resources.displayMetrics;val y=metrics.heightPixels*.45f
      repeat(12){
        val down=SystemClock.uptimeMillis()
        fun event(action:Int,x:Float){val e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);e.source=InputDevice.SOURCE_TOUCHSCREEN;try{assertTrue(a.injectInputEvent(e,true))}finally{e.recycle()}}
        event(MotionEvent.ACTION_DOWN,metrics.widthPixels*.3f)
        for(step in 1..5){Thread.sleep(20);event(MotionEvent.ACTION_MOVE,metrics.widthPixels*(.3f+step*.08f))}
        event(MotionEvent.ACTION_UP,metrics.widthPixels*.7f);Thread.sleep(400)
      }
      val output=JSONObject().put("focusEvents",JSONArray(focus.toList())).put("distinctLabels",focus.distinct().size)
        .put("outcome",if(focus.distinct().size>=3)"observed" else "unqualified: injected navigation produced no sufficient app accessibility-focus events")
        .put("scope","Actual TalkBack service with injected swipe navigation; speech, OEM ordering and physical gestures remain unqualified")
      File(ctx.getExternalFilesDir(null),"r10-talkback-focus.json").writeText(output.toString(2))
      a.takeScreenshot()?.let {image->File(ctx.getExternalFilesDir(null),"r10-talkback.png").outputStream().use{image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};image.recycle()}
      org.junit.Assume.assumeTrue("TalkBack focus injection is inconclusive; manual screen-reader qualification remains required",focus.distinct().size>=3)
    } finally {
      a.setOnAccessibilityEventListener(null)
      shell(if(previous=="null")"settings delete secure enabled_accessibility_services" else "settings put secure enabled_accessibility_services '$previous'")
      shell(if(enabled=="null")"settings delete secure accessibility_enabled" else "settings put secure accessibility_enabled $enabled")
    }
  }
}
