package com.vaultorandroid

import android.util.Log
import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual encrypted queue and pinned HTTPS against a disposable Next host. */
@RunWith(AndroidJUnit4::class)
class NextZipHostTest {
    private fun bridge(action: (PromiseImpl) -> Unit): String {
        val latch = CountDownLatch(1)
        var value = ""
        var refused = false
        action(PromiseImpl(Callback { values -> value=values[0].toString(); latch.countDown() },
            Callback { refused=true; latch.countDown() }))
        assertTrue("Native operation timed out", latch.await(45, TimeUnit.SECONDS))
        assertFalse("Native operation refused", refused)
        return value
    }

    @Test fun submitsVerifiesAndReconcilesActualOwnerDecisions() {
        require(android.os.Build.HARDWARE == "ranchu")
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val args = InstrumentationRegistry.getArguments()
        val address = args.getString("fixtureAddress")!!
        require(context.packageName in setOf("com.vaultor.app", "com.vaultor.app.next") && address.startsWith("https://127.0.0.1:"))
        val module = VaultorModule(BridgeReactContext(context))
        val begin = JSONObject(bridge { module.beginVerifiedPairing(address,args.getString("fixtureFingerprint")!!,it) })
        Log.i("NextZipFixture","PAIR "+begin.getString("code"))
        val host = begin.getString("hostId")
        var paired = false
        for (attempt in 0..30) {
            val response = JSONObject(bridge { module.completePairing(it) })
            if (response.getString("state") == "APPROVED") {paired = true; break}
            Thread.sleep(1200)
        }
        assertTrue("Host did not approve matching fixture code",paired)
        val epoch = JSONObject(bridge { module.activate(host,it) }).getString("epoch")
        val read = JSONObject(bridge { module.apiFor(host,epoch,"/workspace/identity","GET",null,null,it) })
        assertEquals(200,read.getInt("status"))
        val identity = JSONObject(read.getString("body"))
        val scope = JSONArray().put(host).put(identity.getString("id")).put(identity.getString("generation")).toString()
        val store = VaultorImports.get(context)
        val saved = File(context.cacheDir,"media-share/next-fixture.zip")
        saved.parentFile!!.mkdirs()
        instrumentation.context.assets.open("electron-workspace-v5.zip").use {input ->
            saved.outputStream().use {output -> input.copyTo(output)}
        }
        try {
            for (decision in listOf("approve","reject")) {
                val uri = FileProvider.getUriForFile(context,context.packageName+".media",saved)
                val previous = store.rows().map { it.getString("id") }.toSet()
                store.acquire(UUID.randomUUID().toString(),listOf(uri to null),null)
                val id = store.rows().single { it.getString("id") !in previous }.getString("id")
                val input = JSONObject().put("id",id).put("hostId",host).put("epoch",epoch)
                    .put("scope",scope).put("mode","workspaceZip").put("workspaceName","Android ZIP fixture")
                    .put("metered",true)
                bridge { module.collectedImports("confirm",input.toString(),it) }
                bridge { module.collectedImports("sync","{\"force\":true}",it) }
                assertEquals(store.item(id).optString("detail"),"waitingOwner",store.item(id).getString("state"))
                Log.i("NextZipFixture","ZIP $decision $id")
                for (attempt in 0..60) {
                    bridge { module.collectedImports("sync","{\"force\":true}",it) }
                    if (store.item(id).has("receipt")) break
                    Thread.sleep(1000)
                }
                val receipt = store.item(id).getJSONObject("receipt")
                assertEquals(id,receipt.getString("id"))
                assertEquals(if(decision=="approve") "SUCCEEDED" else "REJECTED",receipt.getString("state"))
                if (decision=="approve") assertEquals(id,receipt.getString("destinationWorkspaceId"))
                assertEquals(receipt.getJSONObject("input").getString("sha256"),store.item(id).getString("sha256"))
            }
            if (context.packageName == "com.vaultor.app") {
                Log.i("NextZipFixture", "REVOKE $host")
                var status = 200
                for (attempt in 0..25) {
                    status = JSONObject(bridge { module.apiFor(host, epoch, "/workspace/identity", "GET", null, null, it) })
                        .getInt("status")
                    if (status != 200) break
                    Thread.sleep(750)
                }
                assertEquals("Revoked Android approval must lose access", 401, status)
            }
        } finally {
            saved.delete()
        }
    }
}
