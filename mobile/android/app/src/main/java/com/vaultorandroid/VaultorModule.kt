package com.vaultorandroid

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import com.facebook.react.modules.core.DeviceEventManagerModule
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
  private val network = Executors.newSingleThreadExecutor()
  private val streams = Executors.newSingleThreadExecutor()
  companion object {private val stateLock = Any()}
  @Volatile private var epoch = UUID.randomUUID().toString()
  @Volatile private var stream: HttpsURLConnection? = null
  private val requests = ConcurrentHashMap.newKeySet<HttpsURLConnection>()
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
    require(bytes.size in 29..33554432) { "Recovery storage is invalid; retained for recovery." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0,12)))
    val state=JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)), Charsets.UTF_8))
    if (!state.has("profiles")) {
      val profiles=JSONObject()
      state.optJSONObject("profile")?.let { profiles.put(it.getString("hostId"),it);state.put("selected",it.getString("hostId")) }
      state.put("profiles",profiles)
    }
    if (!state.has("drafts")) {
      val drafts=JSONObject()
      state.optJSONObject("draft")?.let { if(!it.has("title"))it.put("title","Recovered note");drafts.put(it.getString("scope")+"\n"+it.getString("noteId"),it) }
      state.put("drafts",drafts)
    }
    state.put("version",2);return state
  }
  private fun write(value: JSONObject) {
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    require(bytes.size <= 25165824) { "Local recovery storage limit reached. Resolve retained drafts before continuing." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
    val encrypted = cipher.iv + cipher.doFinal(bytes)
    val out = file.startWrite()
    try { out.write(encrypted); file.finishWrite(out) } catch (e: Exception) { file.failWrite(out); throw e }
  }
  private fun run(promise: Promise, action: () -> String) { executor.execute { synchronized(stateLock) {
    try { promise.resolve(action()) } catch (e: Exception) {
      // No payloads, credentials, addresses or platform stack traces in bridge errors.
      promise.reject("VAULTOR_FAILURE", when(e) {
        is SSLException -> "Host TLS verification failed. Verify its address and identity."
        is java.io.IOException -> "Host unavailable or local storage failed. Retain your draft and retry."
        else -> e.message?.take(180) ?: "Operation failed; retry without discarding your draft."
      })
    }
  } } }
  private fun net(promise: Promise, action: () -> String) { network.execute {
    try { promise.resolve(action()) } catch(e:Exception) {
      promise.reject("VAULTOR_NETWORK",if(e is SSLException) "Host TLS verification failed. Verify its identity." else "Host unavailable, access refused or request cancelled. Local drafts are retained.")
    }
  } }
  private fun selected(hostId:String, token:String):JSONObject = synchronized(stateLock) {
    val state=read();require(token==epoch && state.optString("selected")==hostId) {"Connection changed; request cancelled."}
    JSONObject(state.getJSONObject("profiles").getJSONObject(hostId).toString())
  }
  private fun cancelRequests() {epoch=UUID.randomUUID().toString();stream?.disconnect();stream=null;requests.forEach {it.disconnect()}}
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
  private fun request(p: JSONObject, path: String, method: String="GET", body: String?=null, secret: String?=null, revision: String?=null, token:String?=null, multipart:Boolean=false): JSONObject {
    val cert=ca(p);require(fingerprint(cert)==p.getString("fingerprint")) { "Host identity changed; explicit pairing is required." }
    val con=URI(address(p.getString("address"))+"/api"+path).toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(cert).socketFactory
    con.connectTimeout=10000;con.readTimeout=15000;con.instanceFollowRedirects=false;con.requestMethod=method
    con.setRequestProperty("X-Vaultor-Protocol","3")
    if(p.has("credential")) con.setRequestProperty("Authorization","Bearer "+p.getString("credential"))
    if(secret!=null) con.setRequestProperty("X-Vaultor-Pairing",secret)
    if(revision!=null) con.setRequestProperty("If-Match",revision)
    try {
      if(token!=null) {requests.add(con);require(token==epoch) {"Connection changed."}}
      if(body!=null) {
        require(body.toByteArray().size <= 1500000);con.doOutput=true
        val bytes=if(multipart) {
          val payload=JSONObject(body);val boundary="vaultor-"+UUID.randomUUID();con.setRequestProperty("Content-Type","multipart/form-data; boundary=$boundary")
          listOf("title" to payload.getString("title"),"content" to payload.getJSONObject("content").toString()).joinToString("") {(name,value)->"--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n"}.plus("--$boundary--\r\n").toByteArray(Charsets.UTF_8)
        } else {con.setRequestProperty("Content-Type","application/json");body.toByteArray(Charsets.UTF_8)}
        if(token!=null) require(token==epoch)
        con.outputStream.use { it.write(bytes) }
      }
      val status=con.responseCode
      require(status !in 300..399) { "Host redirects are refused." }
      val stream=if(status in 200..299) con.inputStream else con.errorStream
      val bytes=stream?.use { it.readNBytes(1500001) } ?: ByteArray(0)
      require(bytes.size<=1500000) { "Response exceeds the mobile document limit." }
      return JSONObject().put("status",status).put("body",String(bytes,Charsets.UTF_8))
    } finally {requests.remove(con);con.disconnect()}
  }
  private fun json(response: JSONObject): JSONObject {
    require(response.getInt("status") in 200..299) { "Host refused this request (${response.getInt("status")})." }
    return JSONObject(response.getString("body"))
  }
  @ReactMethod fun beginPairing(input: String, promise: Promise) = net(promise) {
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
  @ReactMethod fun completePairing(promise: Promise) = net(promise) {
    val a=pending ?: error("Start pairing first.");val p=a.getJSONObject("profile");val e=a.getJSONObject("enrollment")
    val status=json(request(p,"/pairings/"+e.getString("id"),secret=e.getString("secret")))
    if(status.getString("state")!="APPROVED") return@net status.toString()
    val done=json(request(p,"/pairings/"+e.getString("id")+"/complete","POST","{}",e.getString("secret")))
    require(done.getString("credential").matches(Regex("[a-f0-9]{64}")));p.put("credential",done.getString("credential"))
    synchronized(stateLock) {val state=read();val profiles=state.optJSONObject("profiles") ?: JSONObject();require(profiles.has(p.getString("hostId")) || profiles.length()<8) {"Remove a remembered host before pairing another."};profiles.put(p.getString("hostId"),p);state.put("profiles",profiles);state.put("selected",p.getString("hostId"));state.put("profile",p);write(state);cancelRequests()};pending=null
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

  /** Scoped local state; public summaries never contain native host credentials. */
  @ReactMethod fun storage(action:String, input:String, promise:Promise)=run(promise) {
    require(input.length<=1500000);val a=JSONObject(input);val state=read()
    val drafts=state.optJSONObject("drafts") ?: JSONObject().also {state.put("drafts",it)}
    val sessions=state.optJSONObject("sessions") ?: JSONObject().also {state.put("sessions",it)}
    val cache=state.optJSONObject("cache") ?: JSONObject().also {state.put("cache",it)}
    fun entryKey():String {val scope=a.getString("scope");val id=a.getString("noteId");require(scope.length in 1..512 && id.matches(Regex("[a-fA-F0-9-]{36}")));val base=scope+"\n"+id;val record=a.optString("recoveryKey");require(record.isEmpty() || record==base+"\n"+a.getString("version"));return if(record.isEmpty())base else record}
    when(action) {
      "bootstrap" -> {
        val profiles=JSONArray();val p=state.optJSONObject("profiles") ?: JSONObject()
        p.keys().forEach {id->val value=p.getJSONObject(id);profiles.put(JSONObject().put("hostId",id).put("address",value.getString("address")))}
        val list=JSONArray();drafts.keys().forEach {key->val d=drafts.getJSONObject(key);list.put(JSONObject().put("scope",d.getString("scope")).put("noteId",d.getString("noteId")).put("title",d.optString("title","Recovered note")).put("version",d.getString("version")).put("resolved",d.optBoolean("resolved")).put("recoveryKey",d.optString("recoveryKey")))}
        return@run JSONObject().put("profiles",profiles).put("selected",state.optString("selected")).put("epoch",epoch).put("drafts",list).put("sessions",sessions).toString()
      }
      "getDraft" -> return@run drafts.optJSONObject(entryKey())?.toString() ?: "null"
      "putDraft" -> {
        val key=entryKey();require(drafts.has(key) || drafts.length()<32) {"32 retained drafts reached. Resolve a draft before editing another note."}
        require(a.getString("version").length in 1..100 && a.getString("revision").length in 1..100 && a.getJSONObject("content").getString("type")=="doc")
        drafts.put(key,a);state.remove("draft")
      }
      "ackDraft","keepSaved" -> {
        val key=entryKey();val d=drafts.optJSONObject(key)
        if(d?.optString("version")==a.getString("version")) {
          if(action=="ackDraft") drafts.remove(key) else {val archive=key+"\n"+d.getString("version");d.put("resolved",true).put("recoveryKey",archive);drafts.remove(key);drafts.put(archive,d)}
          state.remove("draft")
        }
      }
      "getSession" -> return@run sessions.optJSONObject(a.getString("scope"))?.toString() ?: "null"
      "putSession" -> {
        val scope=a.getString("scope");require(scope.length in 1..512);a.put("at",System.currentTimeMillis());sessions.put(scope,a)
        while(sessions.length()>32) {val oldest=sessions.keys().asSequence().minBy {sessions.getJSONObject(it).optLong("at")};sessions.remove(oldest)}
      }
      "getCache" -> return@run cache.optJSONObject(entryKey())?.getJSONObject("note")?.toString() ?: "null"
      "putCache" -> {
        val key=entryKey();a.put("at",System.currentTimeMillis());cache.put(key,a)
        while(cache.length()>12 || cache.toString().toByteArray().size>8388608) {val oldest=cache.keys().asSequence().minBy {cache.getJSONObject(it).optLong("at")};cache.remove(oldest)}
      }
      else -> error("Unsupported local state operation.")
    }
    write(state);"{}"
  }
  @ReactMethod fun uuid(promise:Promise)=run(promise) {JSONObject().put("id",UUID.randomUUID().toString()).toString()}
  @ReactMethod fun activate(hostId:String, promise:Promise)=run(promise) {
    val state=read();val profiles=state.getJSONObject("profiles");require(profiles.has(hostId));cancelRequests();state.put("selected",hostId);write(state)
    JSONObject().put("hostId",hostId).put("epoch",epoch).put("address",profiles.getJSONObject(hostId).getString("address")).toString()
  }
  @ReactMethod fun signOut(hostId:String,promise:Promise)=run(promise) {
    val state=read();state.optJSONObject("profiles")?.remove(hostId)
    if(state.optString("selected")==hostId) {cancelRequests();state.remove("selected")}
    if(state.optJSONObject("profile")?.optString("hostId")==hostId) state.remove("profile")
    // Recovery documents survive removal; clean caches/session layout for this host do not.
    for(name in listOf("cache","sessions")) {val records=state.optJSONObject(name) ?: continue;records.keys().asSequence().toList().forEach {key->if(key.startsWith("[\"$hostId\","))records.remove(key)}}
    write(state);"{}"
  }
  @ReactMethod fun changeAddress(hostId:String,input:String,promise:Promise)=net(promise) {
    val captured=epoch;val p=selected(hostId,captured);p.put("address",address(input));val h=json(request(p,"/access/host",token=captured))
    require(h.getString("hostId")==hostId && h.getString("fingerprint")==p.getString("fingerprint"))
    synchronized(stateLock) {require(captured==epoch);val state=read();state.getJSONObject("profiles").put(hostId,p);write(state);cancelRequests()};"{}"
  }
  @ReactMethod fun apiFor(hostId:String,token:String,path:String,method:String,body:String?,revision:String?,promise:Promise)=net(promise) {
    val validId="[a-fA-F0-9-]{36}"
    require((method=="GET" && (path=="/capabilities" || path=="/workspace/identity" || path.matches(Regex("/resources(?:\\?page=0&size=30&type=note|/$validId)")))) ||
      (method=="PUT" && ((path.matches(Regex("/resources/$validId/note")) && revision!=null) || path.matches(Regex("/resources/imports/$validId"))))) {"Unsupported mobile operation."}
    val p=selected(hostId,token)
    if(path=="/capabilities") {val h=json(request(p,"/access/host",token=token));require(h.getString("hostId")==hostId && h.getString("fingerprint")==p.getString("fingerprint"))}
    request(p,path,method,body,revision=revision,token=token,multipart=path.contains("/imports/")).toString()
  }
  @ReactMethod fun addListener(name:String) {} // Required NativeEventEmitter lifecycle surface.
  @ReactMethod fun removeListeners(count:Double) {}
  @ReactMethod fun stopChanges() {stream?.disconnect();stream=null}
  @ReactMethod fun startChanges(hostId:String,token:String,cursor:String,promise:Promise)=run(promise) {
    require(cursor.length<=128 && (cursor.isEmpty() || cursor.matches(Regex("[a-zA-Z0-9:-]+"))))
    val p=selected(hostId,token);stream?.disconnect()
    val con=URI(address(p.getString("address"))+"/api/changes"+if(cursor.isEmpty())"" else "?cursor=$cursor").toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(ca(p)).socketFactory;con.connectTimeout=10000;con.readTimeout=20000;con.instanceFollowRedirects=false
    con.setRequestProperty("Authorization","Bearer "+p.getString("credential"));con.setRequestProperty("X-Vaultor-Protocol","3");con.setRequestProperty("Accept","text/event-stream");stream=con
    streams.execute {
      var status=0
      fun emit(payload:JSONObject) {if(token==epoch && stream===con) ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("VaultorChanges",payload.put("epoch",token).put("hostId",hostId).toString())}
      try {
        status=con.responseCode;require(status==200 && con.contentType?.startsWith("text/event-stream")==true)
        con.inputStream.bufferedReader(Charsets.UTF_8).use {reader->
          val frame=StringBuilder()
          while(token==epoch && stream===con) {
            val c=reader.read();if(c<0)break;if(c==13)continue;frame.append(c.toChar());require(frame.length<=32768)
            if(frame.endsWith("\n\n")) {
              val data=frame.toString().lineSequence().filter {it.startsWith("data:")}.map {it.substring(5).trimStart()}.joinToString("\n");frame.clear()
              if(data.isNotEmpty()) {val event=JSONObject(data);val ids=event.optJSONArray("ids") ?: JSONArray();val safe=JSONObject().put("cursor",event.getString("cursor").take(128)).put("kind",if(ids.length()>100)"reset" else event.getString("kind")).put("generation",event.optString("generation").take(100)).put("ids",if(ids.length()>100)JSONArray() else ids);emit(JSONObject().put("event",safe))}
            }
          }
        }
      } catch(_:Exception) { /* Scoped closed event drives bounded foreground retry, never mutations. */ }
      finally {emit(JSONObject().put("closed",true).put("status",status));if(stream===con)stream=null;con.disconnect()}
    }
    "{}"
  }
}

class VaultorPackage:ReactPackage {
  override fun createNativeModules(ctx:ReactApplicationContext)=listOf<NativeModule>(VaultorModule(ctx))
  override fun createViewManagers(ctx:ReactApplicationContext)=emptyList<ViewManager<*,*>>()
}
