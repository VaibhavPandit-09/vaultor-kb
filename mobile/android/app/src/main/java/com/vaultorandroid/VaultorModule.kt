package com.vaultorandroid

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.*

/** Credentials never leave this native module. Single selected host in A1. */
class VaultorModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "VaultorNative"
  private val executor = Executors.newSingleThreadExecutor()
  private var pending: JSONObject? = null
  private val random = SecureRandom()
  private val file get() = AtomicFile(File(ctx.noBackupFilesDir, "vaultor-state.bin"))
  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!ks.containsAlias("vaultor-local-v1")) KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("vaultor-local-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
      generateKey()
    }
    return ks.getKey("vaultor-local-v1", null) as SecretKey
  }
  private fun read(): JSONObject {
    if (!file.baseFile.exists()) return JSONObject()
    val bytes = file.readFully()
    require(bytes.size in 29..2500000) { "Recovery storage is invalid; retained for recovery." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0,12)))
    return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)), Charsets.UTF_8))
  }
  private fun write(value: JSONObject) {
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    require(bytes.size <= 2000000) { "Local recovery storage limit reached." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
    val encrypted = cipher.iv + cipher.doFinal(bytes)
    val out = file.startWrite()
    try { out.write(encrypted); file.finishWrite(out) } catch (e: Exception) { file.failWrite(out); throw e }
  }
  private fun run(promise: Promise, action: () -> String) { executor.execute {
    try { promise.resolve(action()) } catch (e: Exception) {
      // No payloads, credentials, addresses or platform stack traces in bridge errors.
      promise.reject("VAULTOR_FAILURE", when(e) {
        is SSLException -> "Host TLS verification failed. Verify its address and identity."
        is java.io.IOException -> "Host unavailable or local storage failed. Retain your draft and retry."
        else -> e.message?.take(180) ?: "Operation failed; retry without discarding your draft."
      })
    }
  } }
  private fun address(input: String): String {
    val u = URI(input.trim())
    val host = u.host ?: error("Enter a private IPv4 HTTPS address.")
    val p = host.split('.').mapNotNull { it.toIntOrNull() }
    val valid = host == "localhost" || (p.size == 4 && p.all { it in 0..255 } &&
      (p[0] == 10 || p[0] == 127 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && p[1] in 16..31)))
    require(valid && (host != "localhost" || java.net.InetAddress.getAllByName(host).all {it.isLoopbackAddress}) && u.scheme == "https" && u.userInfo == null && u.query == null && u.fragment == null && (u.path.isNullOrEmpty() || u.path == "/") && (u.port == -1 || u.port in 1..65535)) {
      "Use a bare HTTPS private IPv4 address, such as https://192.168.1.20:8443."
    }
    return "https://$host" + if(u.port == -1) "" else ":${u.port}"
  }
  private fun fingerprint(c: X509Certificate) = MessageDigest.getInstance("SHA-256").digest(c.encoded).joinToString("") { "%02x".format(it) }
  private fun context(cert: X509Certificate): SSLContext {
    cert.checkValidity(); require(cert.basicConstraints >= 0) { "Host authority is invalid." }; cert.verify(cert.publicKey)
    val store=KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null);setCertificateEntry("host",cert) }
    val tm=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
    return SSLContext.getInstance("TLS").apply { init(null,tm.trustManagers,random) }
  }
  private fun ca(p: JSONObject): X509Certificate = CertificateFactory.getInstance("X.509")
    .generateCertificate(Base64.decode(p.getString("ca"),Base64.NO_WRAP).inputStream()) as X509Certificate
  private fun request(p: JSONObject, path: String, method: String="GET", body: String?=null, secret: String?=null, revision: String?=null): JSONObject {
    val cert=ca(p);require(fingerprint(cert)==p.getString("fingerprint")) { "Host identity changed; explicit pairing is required." }
    val con=URI(address(p.getString("address"))+"/api"+path).toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(cert).socketFactory
    con.connectTimeout=10000;con.readTimeout=15000;con.instanceFollowRedirects=false;con.requestMethod=method
    con.setRequestProperty("X-Vaultor-Protocol","3")
    if(p.has("credential")) con.setRequestProperty("Authorization","Bearer "+p.getString("credential"))
    if(secret!=null) con.setRequestProperty("X-Vaultor-Pairing",secret)
    if(revision!=null) con.setRequestProperty("If-Match",revision)
    try {
      if(body!=null) { require(body.toByteArray().size <= 1500000);con.doOutput=true;con.setRequestProperty("Content-Type","application/json");con.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) } }
      val status=con.responseCode
      require(status !in 300..399) { "Host redirects are refused." }
      val stream=if(status in 200..299) con.inputStream else con.errorStream
      val bytes=stream?.use { it.readNBytes(1500001) } ?: ByteArray(0)
      require(bytes.size<=1500000) { "Response exceeds the mobile document limit." }
      return JSONObject().put("status",status).put("body",String(bytes,Charsets.UTF_8))
    } finally {con.disconnect()}
  }
  private fun json(response: JSONObject): JSONObject {
    require(response.getInt("status") in 200..299) { "Host refused this request (${response.getInt("status")})." }
    return JSONObject(response.getString("body"))
  }
  @ReactMethod fun beginPairing(input: String, promise: Promise) = run(promise) {
    val origin=address(input);val u=URI(origin)
    // Enrollment-only TLS observation: never sends HTTP, credentials or document data.
    var observed: X509Certificate?=null
    val observer=object:X509TrustManager {
      override fun getAcceptedIssuers()=emptyArray<X509Certificate>()
      override fun checkClientTrusted(c:Array<X509Certificate>, a:String) {error("Client trust is unsupported.")}
      override fun checkServerTrusted(c:Array<X509Certificate>, a:String) {
        require(c.size in 1..6);val root=c.last();context(root);observed=root
      }
    }
    val ssl=SSLContext.getInstance("TLS").apply {init(null,arrayOf<TrustManager>(observer),random)}
    (ssl.socketFactory.createSocket() as SSLSocket).use {
      it.connect(java.net.InetSocketAddress(u.host,if(u.port==-1)443 else u.port),8000);it.soTimeout=8000;it.startHandshake()
    }
    val cert=observed ?: error("Host did not supply its public authority.")
    val profile=JSONObject().put("address",origin).put("ca",Base64.encodeToString(cert.encoded,Base64.NO_WRAP)).put("fingerprint",fingerprint(cert))
    val host=json(request(profile,"/access/host"))
    require(host.getString("fingerprint")==profile.getString("fingerprint"));profile.put("hostId",host.getString("hostId"))
    val nonce=ByteArray(32).also { random.nextBytes(it) }.joinToString("") {"%02x".format(it)}
    val enrollment=json(request(profile,"/pairings","POST",JSONObject().put("name","Vaultor Android").put("kind","desktop").put("nonce",nonce).put("fingerprint",profile.getString("fingerprint")).toString()))
    require(enrollment.getString("hostId")==profile.getString("hostId") && enrollment.getString("fingerprint")==profile.getString("fingerprint"))
    pending=JSONObject().put("profile",profile).put("enrollment",enrollment)
    JSONObject().put("code",enrollment.getString("code")).put("hostId",host.getString("hostId")).put("fingerprint",profile.getString("fingerprint")).toString()
  }
  @ReactMethod fun completePairing(promise: Promise) = run(promise) {
    val a=pending ?: error("Start pairing first.");val p=a.getJSONObject("profile");val e=a.getJSONObject("enrollment")
    val status=json(request(p,"/pairings/"+e.getString("id"),secret=e.getString("secret")))
    if(status.getString("state")!="APPROVED") return@run status.toString()
    val done=json(request(p,"/pairings/"+e.getString("id")+"/complete","POST","{}",e.getString("secret")))
    require(done.getString("credential").matches(Regex("[a-f0-9]{64}")));p.put("credential",done.getString("credential"))
    val state=read();state.put("profile",p);write(state);pending=null
    JSONObject().put("state","APPROVED").toString()
  }
  @ReactMethod fun profile(promise: Promise)=run(promise) {
    val p=read().optJSONObject("profile") ?: return@run "null"
    JSONObject().put("address",p.getString("address")).put("hostId",p.getString("hostId")).toString()
  }
  @ReactMethod fun api(path:String, method:String, body:String?, revision:String?, promise:Promise)=run(promise) {
    require((method=="GET" && (path=="/capabilities" || path=="/workspace/identity" || path.matches(Regex("/resources(?:\\?page=0&size=30&type=note|/[a-fA-F0-9-]{36})")))) ||
      (method=="PUT" && path.matches(Regex("/resources/[a-fA-F0-9-]{36}/note")) && revision!=null)) {"Unsupported mobile operation."}
    val profile=read().getJSONObject("profile")
    if(path=="/capabilities") {
      val identity=json(request(profile,"/access/host"))
      require(identity.getString("hostId")==profile.getString("hostId") && identity.getString("fingerprint")==profile.getString("fingerprint")) {"Address serves a different host; verify it explicitly."}
    }
    request(profile,path,method,body,revision=revision).toString()
  }
  @ReactMethod fun journal(value:String, promise:Promise)=run(promise) {
    val state=read();val journal=JSONObject(value);require(journal.has("scope") && journal.has("noteId") && journal.has("version"));state.put("draft",journal);write(state);"{}"
  }
  @ReactMethod fun draft(promise:Promise)=run(promise) {read().optJSONObject("draft")?.toString() ?: "null"}
  @ReactMethod fun acknowledge(version:String,promise:Promise)=run(promise) {
    val state=read();if(state.optJSONObject("draft")?.optString("version")==version) {state.remove("draft");write(state)};"{}"
  }
}

class VaultorPackage:ReactPackage {
  override fun createNativeModules(ctx:ReactApplicationContext)=listOf<NativeModule>(VaultorModule(ctx))
  override fun createViewManagers(ctx:ReactApplicationContext)=emptyList<ViewManager<*,*>>()
}
