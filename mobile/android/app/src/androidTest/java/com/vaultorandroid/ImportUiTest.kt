package com.vaultorandroid
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.util.UUID
@RunWith(AndroidJUnit4::class)
class ImportUiTest {
 init{require(android.os.Build.HARDWARE=="ranchu")}
 private val i get()=InstrumentationRegistry.getInstrumentation()
 private val ctx get()=i.targetContext
 private val d get()=UiDevice.getInstance(i)
 private fun share(text:String){ctx.startActivity(Intent(Intent.ACTION_SEND).setClassName(ctx.packageName,"com.vaultorandroid.MainActivity").setType("text/plain").putExtra(Intent.EXTRA_TEXT,text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
 private fun settle(test:()->Boolean){repeat(150){if(test())return;Thread.sleep(100)};fail("Import state did not settle")}
 @Test fun coldAndWarmSharesRemainUnassignedAndUseExistingNavigation(){
  val store=VaultorImports.get(ctx);val marker="R7 cold Share "+UUID.randomUUID();val before=store.rows().map{it.getString("id")}.toSet();share(marker);settle {store.rows().any{it.getString("id") !in before&&it.optString("state")=="collected"}}
  val first=store.rows().single{it.getString("id") !in before};assertFalse(first.has("source"));assertFalse(first.has("attempted"));assertTrue(d.wait(Until.hasObject(By.text("Pending imports")),20000));assertFalse(d.hasObject(By.text("Uploads")))
  val previous=store.rows().map{it.getString("id")}.toSet();share("R7 warm Share "+UUID.randomUUID());settle {store.rows().any{it.getString("id") !in previous&&it.optString("state")=="collected"}};val second=store.rows().single{it.getString("id") !in previous};assertFalse(second.has("source"));assertFalse(second.has("attempted"));assertTrue(d.hasObject(By.text("Pending imports")))
  var input=d.findObject(By.desc("Shared text.txt · Choose destination"));repeat(8){if(input==null){d.swipe(540,1900,540,900,20);input=d.findObject(By.desc("Shared text.txt · Choose destination"))}};assertNotNull(input);input!!.click();var confirm=d.hasObject(By.desc("Confirm destination & queue"));repeat(8){if(!confirm){d.swipe(540,1900,540,900,20);confirm=d.hasObject(By.desc("Confirm destination & queue"))}};assertTrue("Destination confirmation must be reachable in the single scrolling sheet",confirm);assertFalse(store.item(first.getString("id")).has("intent"));d.pressBack();assertTrue(d.wait(Until.gone(By.text("Pending imports")),5000));
  store.remove(first.getString("id"));store.remove(second.getString("id"))
 }
}
