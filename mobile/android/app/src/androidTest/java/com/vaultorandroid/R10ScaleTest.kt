package com.vaultorandroid

import android.content.Intent
import android.util.Log
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

/** Installed production APK, explicit emulator, disposable Small/Atlas HTTPS only. */
@RunWith(AndroidJUnit4::class)
class R10ScaleTest {
  init { require(android.os.Build.HARDWARE == "ranchu") }
  private val i get() = InstrumentationRegistry.getInstrumentation()
  private val args get() = InstrumentationRegistry.getArguments()
  private val ctx get() = i.targetContext
  private val metadata get() = File(ctx.cacheDir, "r10-scale.json")
  private fun module() = VaultorModule(BridgeReactContext(ctx))
  private fun call(action: (PromiseImpl) -> Unit): String {
    val latch = CountDownLatch(1); var value = ""; var failed = false
    action(PromiseImpl(Callback { value = it[0]?.toString() ?: "null"; latch.countDown() },
      Callback { failed = true; value = (it[0] as? ReadableMap)?.getString("message") ?: "Native rejection"; latch.countDown() }))
    assertTrue("Native call deadline", latch.await(180, TimeUnit.SECONDS))
    assertFalse(value, failed); return value
  }
  private fun boot(m: VaultorModule) = JSONObject(call { m.storage("bootstrap", "{}", it) })
  private fun emit(name: String, value: JSONObject) {
    File(ctx.getExternalFilesDir(null), "r10-$name.json").writeText(value.toString(2))
    Log.i("VaultorR10", "$name measurement saved")
  }
  private fun download(m: VaultorModule, a: JSONObject): JSONObject {
    val began = System.nanoTime()
    val id = JSONObject(call { m.companion("start", a.toString(), it) }).getString("id")
    repeat(12000) {
      val rows = JSONArray(call { m.companion("list", "{}", it) })
      val row = (0 until rows.length()).map { rows.getJSONObject(it) }.single { it.getString("id") == id }
      if (!row.optBoolean("workerActive") && row.getString("status") != "downloading") {
        assertEquals(row.optString("detail"), "ready", row.getString("status"))
        return JSONObject().put("ms", (System.nanoTime() - began) / 1e6).put("job", row)
      }
      Thread.sleep(100)
    }
    error("Checkpoint did not finish within 20 minutes")
  }
  @Test fun pairSelectAndDownload() {
    val address = args.getString("address")!!
    require(address.matches(Regex("https://127\\.0\\.0\\.1:[0-9]+")))
    val expected = args.getString("expectedResources")!!.toInt(); require(expected in listOf(70, 5000))
    if (android.os.Build.VERSION.SDK_INT >= 37) i.uiAutomation.grantRuntimePermission(ctx.packageName, android.Manifest.permission.ACCESS_LOCAL_NETWORK)
    val m = module()
    val before = boot(m)
    val profiles = before.getJSONArray("profiles")
    if (profiles.length() >= 8) {
      val old = (0 until profiles.length()).map { profiles.getJSONObject(it) }.first {
        it.getString("hostId") != before.optString("selected") && it.getString("address").startsWith("https://127.0.0.1:")
      }
      val reviews = call { m.reviewCapture("list", "{}", it) }
      call { m.signOut(old.getString("hostId"), it) }
      assertEquals("Forgetting a disposable approval must preserve protected Reviews", reviews, call { m.reviewCapture("list", "{}", it) })
    }
    val enrollment = JSONObject(call { m.beginPairing(address, it) })
    Log.i("VaultorR10", "PAIR_CODE " + enrollment.getString("code"))
    var approved = false
    repeat(120) { if (!approved) { approved = JSONObject(call { m.completePairing(it) }).optString("state") == "APPROVED"; if (!approved) Thread.sleep(2000) } }
    assertTrue("Matching fixture owner approval required", approved)
    val active = JSONObject(call { m.activate(enrollment.getString("hostId"), it) })
    selectAndDownload(m, active.getString("hostId"), active.getString("epoch"), expected)
  }
  private fun selectAndDownload(m: VaultorModule, host: String, epoch: String, expected: Int) {
    val workspace = args.getString("workspaceId")!!; val generation = args.getString("generation")!!
    val active = JSONObject(call { m.selectWorkspace(host, epoch, workspace, generation, it) })
    val scope = JSONArray(listOf(host, workspace, generation)).toString()
    val a = JSONObject().put("hostId", host).put("epoch", active.getString("epoch")).put("workspaceId", workspace).put("scope", scope)
      .put("name", "R10 $expected resources").put("selection", JSONObject().put("scope", "workspace").put("ids", JSONArray()).put("dependencies", "linked").put("files", "readable"))
    call { m.companion("policyPut", "{\"budgetMiB\":512,\"metered\":true,\"lowBattery\":true}", it) }
    emit("download-$expected", download(m, a))
    a.put("expected", expected).put("noteId", args.getString("noteId")).put("imageId", args.getString("imageId")).put("pdfId", args.getString("pdfId"))
    metadata.writeText(a.toString())
    seedLocalLibrary(m, a)
  }
  @Test fun selectNextAndDownload() {
    val m = module(); val b = boot(m)
    selectAndDownload(m, b.getString("selected"), b.getString("epoch"), args.getString("expectedResources")!!.toInt())
  }
  private fun seedLocalLibrary(m: VaultorModule, a: JSONObject) {
    call { m.companion("activate", a.toString(), it) }
    call { m.storage("putSession", JSONObject().put("scope", a.getString("scope")).put("hostId", a.getString("hostId"))
      .put("localOnly", true).put("view", "browse").put("browse", JSONObject().put("destination", "library").put("query", "").put("mode", "title").put("type", "").put("sort", "updated").put("page", 0).put("scroll", 0)).toString(), it) }
  }
  @Test fun offlineQueriesAndRefreshSeed() {
    val m = module(); val a = JSONObject(metadata.readText()).put("epoch", boot(m).getString("epoch")); val expected = a.getInt("expected")
    val report = JSONObject().put("expected", expected)
    val paths = linkedMapOf("library" to "/resources?size=100", "title" to "/resources?q=field&size=100",
      "content" to "/resources/query?q=observations&size=100", "beacon" to "/resources/query?q=atlasbeacon0317&size=100")
    for ((name, path) in paths) {
      val times = JSONArray()
      repeat(11) {
        val began = System.nanoTime()
        val page = JSONObject(call { m.companion("read", JSONObject(a.toString()).put("path", path).toString(), it) })
        times.put((System.nanoTime() - began) / 1e6)
        assertTrue(page.getJSONArray("items").length() <= 100)
        if (name == "library") assertEquals(expected, page.getInt("totalItems"))
        if (name == "beacon" && expected == 5000) assertTrue(page.getInt("totalItems") > 0)
      }
      report.put(name, times)
    }
    report.put("retainedBytes", File(ctx.noBackupFilesDir, "companions-v1").walkTopDown().filter { it.isFile }.sumOf { it.length() })
    emit("offline-$expected", report); seedLocalLibrary(m, a)
  }
  @Test fun refreshSameSelection() {
    val m = module(); val a = JSONObject(metadata.readText()); val b = boot(m); a.put("epoch", b.getString("epoch"))
    emit("refresh-" + a.getInt("expected"), download(m, a))
  }
  @Test fun verifyChangedFixtureAddress() {
    val address = args.getString("address")!!; require(address.matches(Regex("https://127\\.0\\.0\\.1:[0-9]+")))
    val m = module(); val a = JSONObject(metadata.readText())
    call { m.changeAddress(a.getString("hostId"), address, it) }
    a.put("epoch", boot(m).getString("epoch")); metadata.writeText(a.toString())
  }
  @Test fun offlineLibraryAndScroll() {
    val a = JSONObject(metadata.readText()); val expected = a.getInt("expected"); val d = UiDevice.getInstance(i)
    val began = System.nanoTime()
    ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    // Offline restoration without a current note intentionally enters Home.
    val library = d.wait(Until.findObject(By.desc("Library").enabled(true)), 45000)
    assertNotNull("Offline Home navigation absent", library)
    val homeMs = (System.nanoTime() - began) / 1e6
    library!!.click()
    val libraryBegan = System.nanoTime()
    val usable = d.wait(Until.hasObject(By.text("$expected resources")), 45000)
    d.takeScreenshot(File(ctx.getExternalFilesDir(null), "r10-library-$expected.png"))
    d.dumpWindowHierarchy(File(ctx.getExternalFilesDir(null), "r10-library-$expected.xml"))
    assertTrue("Offline Library did not become usable", usable)
    val report = JSONObject().put("activityToHomeMs", homeMs).put("homeToLibraryMs", (System.nanoTime() - libraryBegan) / 1e6)
      .put("qualification", "Instrumented process; cold process startup is collected separately with am start -W")
    d.executeShellCommand("dumpsys gfxinfo ${ctx.packageName} reset")
    val scrolling = System.nanoTime()
    repeat(12) { val x = d.displayWidth / 2; d.swipe(x, d.displayHeight * 3 / 4, x, d.displayHeight / 3, 12) }
    report.put("twelveScrollsMs", (System.nanoTime() - scrolling) / 1e6)
    assertTrue("Library navigation must remain available after scrolling", d.hasObject(By.desc("Library")))
    File(ctx.getExternalFilesDir(null), "r10-frames-$expected.txt").writeText(d.executeShellCommand("dumpsys gfxinfo ${ctx.packageName}"))
    d.takeScreenshot(File(ctx.getExternalFilesDir(null), "r10-library-$expected.png"))
    emit("ui-$expected", report)
  }
  @Test fun offlineReaderAndMedia() {
    val m = module(); val a = JSONObject(metadata.readText()).put("epoch", boot(m).getString("epoch")).put("offline", true)
    val report = JSONObject(); val detailStart = System.nanoTime()
    val note = JSONObject(call { m.companion("read", JSONObject(a.toString()).put("path", "/resources/" + a.getString("noteId")).toString(), it) })
    assertEquals("doc", note.getJSONObject("content").getString("type")); report.put("noteDetailMs", (System.nanoTime() - detailStart) / 1e6)
    for ((name, mime) in listOf("image" to "image/png", "pdf" to "application/pdf")) {
      val began = System.nanoTime()
      val preview = JSONObject(call { m.media("preview", JSONObject(a.toString()).put("resourceId", a.getString(name + "Id")).put("mime", mime).put("page", 1).put("renderScale", 1).toString(), it) })
      assertTrue(preview.getInt("width") > 0); assertTrue(preview.getInt("height") > 0)
      report.put(name + "PreviewMs", (System.nanoTime() - began) / 1e6)
    }
    call { m.storage("putSession", JSONObject().put("scope", a.getString("scope")).put("hostId", a.getString("hostId"))
      .put("localOnly", true).put("view", "note").put("noteId", a.getString("noteId")).toString(), it) }
    emit("media-" + a.getInt("expected"), report)
  }
  @Test fun prepareIntegratedReviewMetadata() {
    val m = module(); val a = JSONObject(metadata.readText()).put("epoch", boot(m).getString("epoch"))
    val parts = JSONArray(a.getString("scope"))
    a.put("generation", parts.getString(2))
    val note = JSONObject(call { m.companion("read", JSONObject(a.toString()).put("path", "/resources/" + a.getString("noteId")).toString(), it) })
    a.put("revision", note.getString("revision"))
    // Public test metadata only; credentials remain in the production profile.
    File(ctx.cacheDir, "r6-live-review.json").writeText(a.toString())
  }
  @Test fun activateRetainedReader() {
    val m=module();val a=JSONObject(metadata.readText())
    call { m.companion("activate", a.toString(), it) }
    call { m.storage("putSession", JSONObject().put("scope",a.getString("scope")).put("hostId",a.getString("hostId")).put("localOnly",true).put("view","note").put("noteId",a.getString("noteId")).toString(),it) }
  }
}
