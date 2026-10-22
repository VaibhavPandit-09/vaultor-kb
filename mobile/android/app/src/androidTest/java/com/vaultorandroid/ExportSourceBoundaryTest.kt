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
    private fun refusal(status: Int, code: String, expected: Boolean = true, fault: String? = null) {
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
                override fun getResponseCode():Int {if(!path.endsWith("export-capabilities")){if(fault=="tls")throw javax.net.ssl.SSLHandshakeException("Untrusted host");if(fault=="network")throw java.net.SocketTimeoutException("Transient interruption")};return if(path.endsWith("export-capabilities"))200 else status}
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
            assertEquals("$status $code; originalReadable=$readable; offlineExport=$offlineState",expected,store.isLocked(fixture.scope))
            assertEquals(!expected,readable)
            assertEquals(if(expected)"error" else "ready",offlineState)
            assertEquals(expected,fixture.store().isLocked(fixture.scope))
            if(expected){assertTrue(java.io.File(fixture.root,"companions-v1").walkTopDown().any{it.name==fixture.image+".bin"});assertTrue(runCatching{store.query(fixture.scope,"/resources/"+fixture.note)}.isFailure)}
        } finally {
            require(fixture.root.name.startsWith("r4-test-"))
            fixture.root.deleteRecursively()
        }
    }

    @Test fun workspaceGrantRefusalLocksRetainedSource() = refusal(404, "WORKSPACE_UNAVAILABLE")
    @Test fun generationReplacementRefusalLocksRetainedSource() = refusal(409, "EXPORT_GENERATION_CHANGED")
    @Test fun unrelated404DoesNotLock() = refusal(404,"EXPORT_UNAVAILABLE",false)
    @Test fun unrelated409DoesNotLock() = refusal(409,"EXPORT_ID_REUSED",false)
    @Test fun unrelated403DoesNotLock() = refusal(403,"OWNER_REQUIRED",false)
    @Test fun wrongDomainGenerationErrorDoesNotLock() = refusal(409,"IMPORT_GENERATION_CHANGED",false)
    @Test fun untrustedHostCannotInvalidate() = refusal(404,"WORKSPACE_UNAVAILABLE",false,"tls")
    @Test fun transientNetworkCannotInvalidate() = refusal(404,"WORKSPACE_UNAVAILABLE",false,"network")
    @Test fun scopedInvalidationPreservesOtherSourcesAndVerifiedRefreshRecovers() {
        val f=CompanionStoreTest().Fixture();val a=f.store();a.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
        try {
            assertEquals("ready",f.download(a).getString("status"))
            val other=CompanionStoreTest().Fixture(rootOverride=f.root);val b=other.store();assertEquals("ready",other.download(b).getString("status"))
            a.observeScopeResponse(f.scope,"/resources/collected-imports/operation",409,JSONObject().put("code","IMPORT_GENERATION_CHANGED"))
            assertTrue(a.isLocked(f.scope));assertNotNull(b.file(other.scope,other.image))
            assertTrue(f.store().isLocked(f.scope));assertEquals("ready",other.download(b).getString("status"));assertTrue(a.isLocked(f.scope))
            assertEquals("ready",f.download(a).getString("status"));assertFalse(a.isLocked(f.scope));assertNotNull(a.file(f.scope,f.image))
            a.observeScopeResponse(f.scope,"/reviews/operation",409,JSONObject().put("code","REVIEW_GENERATION_CHANGED"));assertTrue(a.isLocked(f.scope));assertNotNull(b.file(other.scope,other.image))
        } finally {f.root.deleteRecursively()}
    }
    @Test fun invalidationDuringVerifiedRefreshCannotUnlockSource() {
        val f=CompanionStoreTest().Fixture();val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
        val entered=java.util.concurrent.CountDownLatch(1);val resume=java.util.concurrent.CountDownLatch(1)
        try {
            assertEquals("ready",f.download(store).getString("status"));var identities=0
            f.identityHook={if(++identities==2){entered.countDown();check(resume.await(10,java.util.concurrent.TimeUnit.SECONDS))}}
            val id=store.start(f.args).getString("id");assertTrue(entered.await(10,java.util.concurrent.TimeUnit.SECONDS))
            store.observeScopeResponse(f.scope,"/companions/exports/operation",409,JSONObject().put("code","EXPORT_GENERATION_CHANGED"));resume.countDown()
            assertEquals("paused",f.await(store,id).getString("status"));assertTrue(store.isLocked(f.scope));assertTrue(f.store().isLocked(f.scope))
            f.identityHook=null;assertEquals("ready",f.download(store).getString("status"));assertNotNull(store.file(f.scope,f.image))
        } finally {resume.countDown();f.root.deleteRecursively()}
    }

    @Test fun concurrentDomainRefusalsPreserveProtectedImportsReviewsAndOriginals() {
        val f=CompanionStoreTest().Fixture();val store=f.store()
        store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
        val ctx=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        val inputRoot=java.io.File(ctx.cacheDir,"source-lock-import-"+java.util.UUID.randomUUID())
        val imports=VaultorImports.fixture(ctx,inputRoot)
        val reviewFile=java.io.File(f.root,"protected-review.bin")
        val key=javax.crypto.spec.SecretKeySpec(ByteArray(32){it.toByte()},"AES")
        val reviews=VaultorReviews(reviewFile){key}
        val pool=java.util.concurrent.Executors.newFixedThreadPool(3)
        try {
            assertEquals("ready",f.download(store).getString("status"))
            val source=JSONObject().put("hostId",f.host).put("workspaceId",f.workspace).put("generation",f.generation)
            imports.acquire(java.util.UUID.randomUUID().toString(),emptyList(),"Immutable private import")
            val queued=imports.confirm(imports.rows().single().getString("id"),source,"text",null,null,true)
            val seed=JSONObject().put("scope",f.scope).put("resourceId",f.note).put("targetTitle","Protected original").put("targetType","note").put("baseRevision","r1").put("quote","evidence").put("context","").put("locator",JSONObject().put("kind","resource"))
            val draft=JSONObject(reviews.execute("begin",seed));val reviewId=draft.getString("id")
            reviews.execute("put",JSONObject().put("id",reviewId).put("version",0).put("comment","Keep immutable evidence"))
            val evidence=reviews.execute("queue",JSONObject().put("id",reviewId).put("version",1))
            val original=java.io.File(inputRoot,queued.getString("id")+".bin").readBytes()
            val jobs=listOf("/resources/collected-imports/id" to "IMPORT_GENERATION_CHANGED","/reviews/id" to "REVIEW_GENERATION_CHANGED","/companions/exports/id" to "EXPORT_GENERATION_CHANGED")
            jobs.map{(path,code)->pool.submit{store.observeResponse(source,path,409,JSONObject().put("code",code))}}.forEach{it.get(10,java.util.concurrent.TimeUnit.SECONDS)}
            assertTrue(store.isLocked(f.scope));assertTrue(f.store().isLocked(f.scope))
            assertEquals(queued.getJSONObject("intent").toString(),imports.item(queued.getString("id")).getJSONObject("intent").toString())
            assertArrayEquals(original,java.io.File(inputRoot,queued.getString("id")+".bin").readBytes());imports.original(queued){}
            assertEquals(evidence,JSONArray(VaultorReviews(reviewFile){key}.execute("list",JSONObject())).getJSONObject(0).toString())
        } finally {pool.shutdownNow();imports.closeFixture();inputRoot.deleteRecursively();f.root.deleteRecursively()}
    }

    @Test fun invalidationInterruptsAnExportSnapshotBeforeItsLongLeaseFinishes() {
        val f=CompanionStoreTest().Fixture();val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
        val entered=java.util.concurrent.CountDownLatch(1);val release=java.util.concurrent.CountDownLatch(1);val pool=java.util.concurrent.Executors.newFixedThreadPool(2)
        try {
            assertEquals("ready",f.download(store).getString("status"))
            val reading=pool.submit{store.exportSnapshot(f.scope){_,_,_->entered.countDown();check(release.await(10,java.util.concurrent.TimeUnit.SECONDS));store.requireAccess(f.scope)}}
            assertTrue(entered.await(10,java.util.concurrent.TimeUnit.SECONDS))
            val refusal=pool.submit{store.observeScopeResponse(f.scope,"/companions/exports/id",409,JSONObject().put("code","EXPORT_GENERATION_CHANGED"))}
            var locked=false;repeat(100){if(!locked){locked=store.isLocked(f.scope);if(!locked)Thread.sleep(10)}};assertTrue("Lease must not delay invalidation",locked)
            release.countDown();try{reading.get(10,java.util.concurrent.TimeUnit.SECONDS);fail("In-flight snapshot must stop")}catch(_:java.util.concurrent.ExecutionException){}
            refusal.get(10,java.util.concurrent.TimeUnit.SECONDS);assertTrue(f.store().isLocked(f.scope))
        } finally {release.countDown();pool.shutdownNow();f.root.deleteRecursively()}
    }

    @Test fun oldGenerationRefusalDoesNotLockAuthorizedReplacementButGrantLossDoes() {
        val f=CompanionStoreTest().Fixture();val store=f.store();store.policy(JSONObject().put("metered",true).put("lowBattery",true).put("budgetMiB",128))
        try {
            assertEquals("ready",f.download(store).getString("status"))
            val replacement=CompanionStoreTest().Fixture(rootOverride=f.root,hostOverride=f.host,workspaceOverride=f.workspace);val current=replacement.store();assertEquals("ready",replacement.download(current).getString("status"))
            store.observeScopeResponse(f.scope,"/companions/exports/id",409,JSONObject().put("code","EXPORT_GENERATION_CHANGED"))
            assertTrue(store.isLocked(f.scope));assertFalse(current.isLocked(replacement.scope));assertNotNull(current.file(replacement.scope,replacement.image))
            current.observeScopeResponse(replacement.scope,"/companions/exports/id",404,JSONObject().put("code","WORKSPACE_UNAVAILABLE"));assertTrue(current.isLocked(replacement.scope))
        } finally {f.root.deleteRecursively()}
    }
}
