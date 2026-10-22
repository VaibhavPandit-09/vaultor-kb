package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

/** Integration release gate: authoritative refusals must lock the retained source. */
@RunWith(AndroidJUnit4::class)
class ExportSourceBoundaryTest {
    private fun refusal(status: Int, code: String) {
        require(android.os.Build.HARDWARE == "ranchu")
        val fixture = CompanionStoreTest().Fixture()
        val store = fixture.store()
        store.policy(JSONObject().put("metered", true).put("lowBattery", true).put("budgetMiB", 128))
        assertEquals("ready", fixture.download(store).getString("status"))
        val exports = VaultorExports(fixture.context, store, { _, path, _ ->
            object : HttpsURLConnection(URL("https://127.0.0.1$path")) {
                override fun connect() {}
                override fun disconnect() {}
                override fun usingProxy() = false
                override fun getCipherSuite() = "TEST"
                override fun getLocalCertificates(): Array<Certificate>? = null
                override fun getServerCertificates(): Array<Certificate> = emptyArray()
                override fun getOutputStream() = ByteArrayOutputStream()
                override fun getResponseCode() = if (path.endsWith("export-capabilities")) 200 else status
                override fun getInputStream() = ByteArrayInputStream("{\"version\":1}".toByteArray())
                override fun getErrorStream() = ByteArrayInputStream(JSONObject().put("code", code).put("detail", "Authoritative source refusal").toString().toByteArray())
            }
        }, {}, { emptyList() })
        try {
            val input = JSONObject().put("scope", fixture.scope).put("offline", false)
                .put("request", JSONObject().put("scope", "resources").put("format", "partial")
                    .put("ids", JSONArray(listOf(fixture.note))).put("depth", 0))
            val id = exports.start(input).getString("id")
            var state = ""
            repeat(250) {
                if (state != "error") {
                    Thread.sleep(20)
                    val rows = exports.list()
                    state = (0 until rows.length()).map { rows.getJSONObject(it) }
                        .single { it.getString("id") == id }.getString("state")
                }
            }
            assertEquals("The host refusal was consumed", "error", state)
            val readable = runCatching { store.file(fixture.scope, fixture.image) != null }.getOrDefault(false)
            val offlineId = exports.start(JSONObject(input.toString()).put("offline", true)).getString("id")
            var offlineState = ""
            repeat(250) {
                if (offlineState !in listOf("ready", "error")) {
                    Thread.sleep(20)
                    val rows = exports.list()
                    offlineState = (0 until rows.length()).map { rows.getJSONObject(it) }
                        .single { it.getString("id") == offlineId }.getString("state")
                }
            }
            assertTrue("$status $code was observed but retained source remains unlocked; originalReadable=" +
                readable + "; subsequentOfflineExport=" + offlineState, store.isLocked(fixture.scope))
        } finally {
            require(fixture.root.name.startsWith("r4-test-"))
            fixture.root.deleteRecursively()
        }
    }

    @Test fun workspaceGrantRefusalLocksRetainedSource() = refusal(404, "WORKSPACE_UNAVAILABLE")
    @Test fun generationReplacementRefusalLocksRetainedSource() = refusal(409, "EXPORT_GENERATION_CHANGED")
}
