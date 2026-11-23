package com.vaultorandroid

import android.content.ContextWrapper
import android.util.Log
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.PromiseImpl
import java.io.File
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Two invocations separated by a real package-manager install-over on a disposable emulator. */
@RunWith(AndroidJUnit4::class)
class ProductionUpgradeTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val record get() = File(context.noBackupFilesDir, "production-upgrade-fixture.json")

    init { require(android.os.Build.HARDWARE == "ranchu") }

    private fun call(action: (PromiseImpl) -> Unit): String {
        val latch = CountDownLatch(1)
        var value: String? = null
        action(PromiseImpl(Callback { value = it[0].toString(); latch.countDown() },
            Callback { latch.countDown() }))
        assertTrue("Native fixture operation timed out", latch.await(45, TimeUnit.SECONDS))
        return checkNotNull(value) { "Native fixture operation refused" }
    }

    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it) }

    private fun version() = context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
    private fun bootstrap(module: VaultorModule) = JSONObject(call { module.storage("bootstrap", "{}", it) })

    private fun read(module: VaultorModule, host: String, epoch: String, path: String): JSONObject {
        val result = JSONObject(call { module.apiFor(host, epoch, path, "GET", null, null, it) })
        assertEquals(200, result.getInt("status"))
        return JSONObject(result.getString("body"))
    }

    private fun offline(module: VaultorModule, scope: String, note: String): JSONObject {
        val boot = bootstrap(module)
        val request = JSONObject().put("scope", scope).put("offline", true).put("path", "/resources/$note")
            .put("hostId", boot.getString("selected")).put("epoch", boot.getString("epoch"))
        return JSONObject(call { module.companion("read", request.toString(), it) }).getJSONObject("content")
    }

    private fun snapshot(module: VaultorModule, scope: String, note: String): JSONObject {
        val boot = bootstrap(module)
        val reviews = JSONArray(call { module.reviewCapture("list", "{}", it) })
        val imports = VaultorImports.get(context)
        val originals = imports.rows().map { row ->
            val bytes = ByteArrayOutputStream()
            imports.original(row) { bytes.write(it) }
            JSONObject().put("id", row.getString("id")).put("contentSha256", digest(bytes.toByteArray()))
        }.sortedBy { it.getString("id") }
        return JSONObject().put("profiles", boot.getJSONArray("profiles"))
            .put("selected", boot.getString("selected"))
            .put("reviews", reviews)
            .put("originals", JSONArray(originals))
            .put("preferences", JSONObject(call { module.readerPreferences("get", "{}", it) }))
            .put("offline", offline(module, scope, note))
    }

    @Test fun seedPublishedAlpha28() {
        require(context.packageName == "com.vaultor.app" && version() == 32L && !record.exists())
        val args = InstrumentationRegistry.getArguments()
        val address = checkNotNull(args.getString("fixtureAddress"))
        require(address.matches(Regex("https://127\\.0\\.0\\.1:[0-9]+")))
        val update = File(context.cacheDir, "production-upgrade-verified.apk")
        try {
            val descriptor = instrumentation.uiAutomation.executeShellCommand("cat /data/local/tmp/vaultor-m26c-production.apk")
            ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { input ->
                update.outputStream().use { output -> input.copyTo(output) }
            }
            val verified = VaultorUpdates(context).verify(update)
            assertEquals(36L, verified.getLong("versionCode"))
            assertEquals(args.getString("candidateSha256"), verified.getString("sha256"))
        } finally {
            update.delete()
        }
        if (android.os.Build.VERSION.SDK_INT >= 37) {
            instrumentation.uiAutomation.grantRuntimePermission(context.packageName, android.Manifest.permission.ACCESS_LOCAL_NETWORK)
        }
        val module = VaultorModule(BridgeReactContext(context))
        assertEquals("Use a clean alpha.28 fixture", 0, bootstrap(module).getJSONArray("profiles").length())
        // Alpha.28 exposes this bridge method publicly. The current implementation
        // uses a differently named verified entry point and an internal overload.
        val begin = module.javaClass.getMethod("beginPairing", String::class.java, Promise::class.java)
        val enrollment = JSONObject(call { begin.invoke(module, address, it) })
        Log.i("ProductionUpgrade", "PAIR " + enrollment.getString("code"))
        var approved = false
        for (attempt in 1..90) {
            if (JSONObject(call { module.completePairing(it) }).optString("state") == "APPROVED") {
                approved = true
                break
            }
            Thread.sleep(1000)
        }
        assertTrue("Matching disposable host approval is required", approved)
        val host = enrollment.getString("hostId")
        val epoch = JSONObject(call { module.activate(host, it) }).getString("epoch")
        val identity = read(module, host, epoch, "/workspace/identity")
        val note = checkNotNull(args.getString("noteId"))
        val saved = read(module, host, epoch, "/resources/$note")
        val scope = JSONArray(listOf(host, identity.getString("id"), identity.getString("generation"))).toString()
        val download = JSONObject().put("hostId", host).put("epoch", epoch).put("scope", scope)
            .put("name", "Production upgrade fixture")
            .put("selection", JSONObject().put("scope", "resources").put("ids", JSONArray().put(note))
                .put("dependencies", "linked").put("files", "readable"))
        call { module.companion("policyPut", "{\"budgetMiB\":128,\"metered\":true,\"lowBattery\":true}", it) }
        val job = JSONObject(call { module.companion("start", download.toString(), it) }).getString("id")
        var ready = false
        for (attempt in 1..300) {
            val jobs = JSONArray(call { module.companion("list", "{}", it) })
            val current = (0 until jobs.length()).map(jobs::getJSONObject).single { it.getString("id") == job }
            if (current.getString("status") == "ready") { ready = true; break }
            Thread.sleep(200)
        }
        assertTrue("The published app must download a real host note", ready)
        assertEquals(saved.getJSONObject("content").toString(), offline(module, scope, note).toString())

        val evidence = JSONObject().put("scope", scope).put("hostId", host).put("epoch", epoch).put("offline", true)
            .put("resourceId", note).put("targetTitle", saved.getString("title"))
            .put("targetType", "note").put("baseRevision", saved.get("revision").toString())
            .put("quote", "").put("context", "").put("locator", JSONObject().put("kind", "resource"))
        val review = JSONObject(call { module.reviewCapture("begin", evidence.toString(), it) }).getString("id")
        call { module.reviewCapture("put", JSONObject().put("id", review).put("version", 0)
            .put("comment", "Protected upgrade Review").toString(), it) }
        call { module.reviewCapture("queue", JSONObject().put("id", review).put("version", 1).toString(), it) }
        val draft = JSONObject(call { module.reviewCapture("begin", evidence.toString(), it) }).getString("id")
        call { module.reviewCapture("put", JSONObject().put("id", draft).put("version", 0)
            .put("comment", "Unsubmitted upgrade draft").toString(), it) }
        VaultorImports.get(context).acquire(UUID.randomUUID().toString(), emptyList(), "Exact collected upgrade bytes\r\n")
        call { module.readerPreferences("put", "{\"theme\":\"oled\",\"size\":21}", it) }
        val state = snapshot(module, scope, note)
        assertEquals(2, state.getJSONArray("reviews").length())
        assertEquals(1, state.getJSONArray("originals").length())
        record.writeText(JSONObject().put("scope", scope).put("note", note)
            .put("stateSha256", digest(state.toString().toByteArray())).toString())
    }

    @Test fun verifyInstallOverOffline() {
        assertEquals("com.vaultor.app", context.packageName)
        assertEquals(36L, version())
        val before = JSONObject(record.readText())
        val after = snapshot(VaultorModule(BridgeReactContext(context)), before.getString("scope"), before.getString("note"))
        assertEquals(before.getString("stateSha256"), digest(after.toString().toByteArray()))
    }

    @Test fun reconnectToOriginalHost() {
        val before = JSONObject(record.readText())
        val module = VaultorModule(BridgeReactContext(context))
        val host = bootstrap(module).getString("selected")
        val epoch = JSONObject(call { module.activate(host, it) }).getString("epoch")
        assertEquals(offline(module, before.getString("scope"), before.getString("note")).toString(),
            read(module, host, epoch, "/resources/" + before.getString("note")).getJSONObject("content").toString())
    }

    @Test fun discoverPublishedProductionUpdate() {
        require(context.packageName == "com.vaultor.app" && version() == 32L)
        val expected = checkNotNull(InstrumentationRegistry.getArguments().getString("candidateSha256"))
        val root = File(context.cacheDir, "official-update-${UUID.randomUUID()}").apply { check(mkdir()) }
        try {
            val updates = VaultorUpdates(object : ContextWrapper(context) {
                override fun getNoBackupFilesDir() = root
            })
            verifyPublicUpdate(updates, expected)
        } finally {
            root.deleteRecursively()
        }
    }

    private fun verifyPublicUpdate(updates: VaultorUpdates, expected: String) {
        fun completed(): JSONObject {
            val deadline = android.os.SystemClock.elapsedRealtime() + 150_000
            do {
                val state = updates.snapshot()
                if (!state.getBoolean("busy")) return state
                Thread.sleep(250)
            } while (android.os.SystemClock.elapsedRealtime() < deadline)
            error("Official release request did not finish")
        }
        updates.check()
        val discovered = completed()
        assertEquals(discovered.optString("detail"), "available", discovered.getString("phase"))
        assertEquals(36L, discovered.getJSONObject("available").getLong("versionCode"))
        assertEquals(expected, discovered.getJSONObject("available").getString("sha256"))
        assertFalse(discovered.has("candidate"))
        updates.download()
        val verified = completed()
        assertEquals(verified.optString("detail"), "ready", verified.getString("phase"))
        assertEquals(expected, verified.getJSONObject("candidate").getString("sha256"))
        assertEquals(32L, version())
    }
}
