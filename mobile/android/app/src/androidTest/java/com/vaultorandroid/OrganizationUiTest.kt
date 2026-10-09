package com.vaultorandroid

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class OrganizationUiTest {
 @Test fun collectionAddAndTrashRestoreWithBack() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext;val d=UiDevice.getInstance(i)
  ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  fun tap(label:String){android.util.Log.i("VaultorA7Test","tap $label");assertTrue("Missing action $label",d.wait(Until.hasObject(By.desc(label).enabled(true)),15000));d.findObject(By.desc(label).enabled(true)).click()}
  fun type(label:String,value:String){android.util.Log.i("VaultorA7Test","type $label");assertTrue("Missing input $label",d.wait(Until.hasObject(By.desc(label)),10000));d.findObject(By.desc(label)).text=value;if(d.wait(Until.hasObject(By.pkg("com.google.android.inputmethod.latin")),1000))d.pressBack()}
  fun text(value:String){assertTrue("Missing $value",d.wait(Until.hasObject(By.text(value)),15000))}
  fun scrollTo(label:String){for(n in 1..8){if(d.hasObject(By.desc(label).enabled(true)))return;d.findObject(By.scrollable(true))?.scroll(Direction.DOWN,0.65f)};assertTrue("Missing scroll action $label",d.hasObject(By.desc(label).enabled(true)))}
  if(d.wait(Until.hasObject(By.text("I approved the matching code")),2000))d.findObject(By.text("I approved the matching code")).click()
  try {
  tap("Open navigation");tap("Collections");type("Search resources","A7 UI collection");if(!d.wait(Until.hasObject(By.desc("Actions for A7 UI collection")),2000)){tap("New collection");type("Name","A7 UI collection");tap("Create collection")}
  text("A7 UI collection");tap("Actions for A7 UI collection");tap("Add resource");type("Find organization or resource","A1 Editor fixture");text("A1 Editor fixture");if(d.hasObject(By.desc("Add").enabled(true)))tap("Add");text("Added");d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-add-resource.png"));assertTrue("Actions must settle before Back",d.wait(Until.hasObject(By.desc("Close actions").enabled(true)),10000));d.pressBack();assertTrue(d.wait(Until.hasObject(By.desc("Add resource")),5000));tap("Close actions")
  tap("Open navigation");tap("Library");type("Search resources","A1 Editor fixture");text("A1 Editor fixture");tap("Actions for A1 Editor fixture");tap("References");text("Used in");assertTrue(d.wait(Until.hasObject(By.textContains("1 resources")),10000));d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-references.png"));d.pressBack();assertTrue("Actions did not return after References",d.wait(Until.hasObject(By.desc("Rename")),5000));scrollTo("Move to Trash…");tap("Move to Trash…");if(d.wait(Until.hasObject(By.textContains("Save is unavailable")),1500))tap("Keep protected drafts and review saved versions");text("1 active saved notes use this original");tap("Confirm Trash / Retry");text("Completed");d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-trash-confirmed.png"));d.pressBack()
  tap("Open navigation");tap("Trash");type("Search resources","A1 Editor fixture");text("A1 Editor fixture");tap("Actions for A1 Editor fixture");tap("Restore");tap("Confirm Restore / Retry");text("Completed");d.pressBack()
  tap("Open navigation");tap("Library");type("Search resources","A1 Editor fixture");text("A1 Editor fixture");d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-restored-library.png"));tap("A1 Editor fixture, Note");if(d.wait(Until.hasObject(By.desc("Use saved version")),2000))tap("Use saved version");tap("Note actions");tap("Resource actions");tap("References");text("Used in");assertTrue(d.wait(Until.hasObject(By.textContains("1 resources")),10000));d.waitForIdle();d.pressBack();assertTrue("Note References Back must return Actions",d.wait(Until.hasObject(By.desc("Rename")),5000));tap("Close actions");text("Edit")
  } finally {d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-final-state.png"));d.dumpWindowHierarchy(File(ctx.getExternalFilesDir(null),"a7-final-state.xml"))}
 }
 @Test fun nameConflictAllowsCorrectedInput() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext;val d=UiDevice.getInstance(i)
  ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  fun tap(label:String){android.util.Log.i("VaultorA7Test","tap $label");assertTrue("Missing $label",d.wait(Until.hasObject(By.desc(label).enabled(true)),15000));d.findObject(By.desc(label).enabled(true)).click()}
  fun type(label:String,value:String){android.util.Log.i("VaultorA7Test","type $label");assertTrue("Missing editable input $label",d.wait(Until.hasObject(By.desc(label).enabled(true)),10000));d.findObject(By.desc(label).enabled(true)).text=value;if(d.wait(Until.hasObject(By.pkg("com.google.android.inputmethod.latin")),1000))d.pressBack()}
  try {
  tap("Open navigation");tap("Collections");type("Search resources","A7 UI collection");if(!d.wait(Until.hasObject(By.desc("Actions for A7 UI collection")),2000)){tap("New collection");type("Name","A7 UI collection");tap("Create collection");assertTrue(d.wait(Until.hasObject(By.desc("Actions for A7 UI collection")),10000))};tap("New collection");if(d.wait(Until.hasObject(By.text("Retry finishes the same pending creation.")),1500)){tap("Create collection");assertTrue(d.wait(Until.hasObject(By.textContains("Choose another name")),10000))};type("Name","A7 UI collection");tap("Create collection")
  assertTrue("Name conflict must retain editable input",d.wait(Until.hasObject(By.textContains("Choose another name")),10000))
  val name="A7 corrected name "+System.currentTimeMillis();type("Name",name);d.findObject(By.desc("Name")).click();d.pressEnter()
  assertTrue(d.wait(Until.gone(By.desc("Close actions")),10000));type("Search resources",name);assertTrue(d.wait(Until.hasObject(By.desc("Actions for "+name)),10000))
  } finally {d.takeScreenshot(File(ctx.getExternalFilesDir(null),"a7-name-state.png"));d.dumpWindowHierarchy(File(ctx.getExternalFilesDir(null),"a7-name-state.xml"))}
 }

}
