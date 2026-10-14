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
  private val media by lazy { VaultorMedia(ctx,{bytes ->
    val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.ENCRYPT_MODE,key())};cipher.iv+cipher.doFinal(bytes)
  },{bytes ->
    require(bytes.size>=29);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));cipher.doFinal(bytes.copyOfRange(12,bytes.size))
  },{a,path,method ->
    require(path.matches(Regex("/resources/(?:imports/)?[a-fA-F0-9-]{36}(?:/(?:raw|thumbnail))?")))
    val p=selected(a.getString("hostId"),a.getString("epoch"));val cert=ca(p);require(fingerprint(cert)==p.getString("fingerprint"))
    val con=URI(address(p.getString("address"))+"/api"+path).toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(cert).socketFactory;con.connectTimeout=10000;con.readTimeout=30000;con.instanceFollowRedirects=false;con.requestMethod=method
    con.setRequestProperty("Authorization","Bearer "+p.getString("credential"));con.setRequestProperty("X-Vaultor-Protocol","3");if(path!="/capabilities" && p.optString("selectedWorkspaceId").isNotEmpty())con.setRequestProperty("X-Vaultor-Workspace",p.getString("selectedWorkspaceId"));con
  },{a ->
    val p=selected(a.getString("hostId"),a.getString("epoch"));val scope=JSONArray(a.getString("scope"));require(scope.length()==3 && scope.getString(0)==a.getString("hostId"))
    val identity=json(request(p,"/workspace/identity",token=a.getString("epoch")))
    require(scope.getString(1)==identity.getString("id") && scope.getString(2)==identity.getString("generation")) {"Workspace changed. Media remains bound to its original source."}
  }) }
  @ReactMethod fun media(action:String,input:String,promise:Promise) {try {require(action in listOf("list","thumbnail","preview","share","open","copy","save")) {"Android reading cannot upload or alter placements. Export legacy recovery instead."};require(input.length<=12000);media.call(action,JSONObject(input),promise)}catch(_:Exception){promise.reject("MEDIA_INPUT","Invalid media request.")}}
  @ReactMethod fun cancelMedia() {media.cancel()}
  /** Device presentation only. Does not acknowledge or export legacy recovery records. */
  @ReactMethod fun readerPreferences(action:String,input:String,promise:Promise)=run(promise) {
    val prefs=ctx.getSharedPreferences("reader-presentation-v1",android.content.Context.MODE_PRIVATE)
    when(action){
      "get" -> prefs.getString("preferences","{}") ?: "{}"
      "put" -> {require(input.length<=2000);val a=JSONObject(input)
        val theme=a.optString("theme","os");val accent=a.optString("accent","blue");require(theme in listOf("os","light","dark","oled") && accent in listOf("blue","violet","mint","amber"))
        val v=JSONObject().put("theme",theme).put("accent",accent).put("size",a.optDouble("size",18.0).also{require(it.isFinite())}.coerceIn(14.0,28.0)).put("spacing",a.optDouble("spacing",1.75).also{require(it.isFinite())}.coerceIn(1.4,2.2)).put("measure",a.optInt("measure",660).coerceIn(320,800)).put("motion",if(a.optString("motion")=="snappy")"snappy" else "smooth")
        require(prefs.edit().putString("preferences",v.toString()).commit()) {"Cannot persist reading preferences."};v.toString()
      }
      else -> error("Unsupported reading preference action.")
    }
  }
  @ReactMethod fun readerMediaPosition(action:String,input:String,promise:Promise)=run(promise) {
    require(input.length<=2000);val a=JSONObject(input);val scope=a.getString("scope");require(scope.length in 1..512);val id=a.getString("resourceId");require(id.matches(Regex("[a-fA-F0-9-]{36}")))
    val state=read();val all=state.optJSONObject("readerMedia") ?: JSONObject();val entry=scope+"\n"+id
    when(action){
      "get" -> all.optJSONObject(entry)?.toString() ?: "{}"
      "put" -> {val v=JSONObject().put("page",a.optInt("page",0).coerceIn(0,100000)).put("zoom",a.optDouble("zoom",1.0).also{require(it.isFinite())}.coerceIn(1.0,4.0)).put("x",a.optDouble("x",0.0).also{require(it.isFinite())}.coerceIn(0.0,10000000.0)).put("y",a.optDouble("y",0.0).also{require(it.isFinite())}.coerceIn(0.0,10000000.0)).put("at",System.currentTimeMillis());all.put(entry,v)
        while(all.length()>100){all.remove(all.keys().asSequence().minBy{all.getJSONObject(it).optLong("at")})};state.put("readerMedia",all);write(state);v.toString()
      }
      else -> error("Unsupported reading position action.")
    }
  }
  @ReactMethod fun openExternal(input:String,promise:Promise) {
    try {require(input.length<=2048 && !input.any{it.isWhitespace() || it.code<32});val uri=URI(input);require(uri.scheme in listOf("http","https") && !uri.host.isNullOrEmpty() && uri.rawUserInfo==null)
      ctx.runOnUiQueueThread {try {val activity=ctx.currentActivity ?: error("Open Vaultor first.");activity.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(uri.toASCIIString())).addCategory(android.content.Intent.CATEGORY_BROWSABLE));promise.resolve("{}")}catch(_:Exception){promise.reject("EXTERNAL_LINK","No browser is available. Copy the link instead.")}}
    }catch(_:Exception){promise.reject("EXTERNAL_LINK","Only HTTP or HTTPS links without embedded credentials can be opened.")}
  }
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
        is java.io.IOException -> "Host unavailable or local reading storage failed. Recovery remains; retry."
        else -> e.message?.take(180) ?: "Operation failed; retry. Retained recovery is unchanged."
      })
    }
  } } }
  private fun net(promise: Promise, action: () -> String) { network.execute {
    try { promise.resolve(action()) } catch(e:Exception) {
      promise.reject("VAULTOR_NETWORK",if(e is SSLException) "Host TLS verification failed. Verify its identity." else "Host unavailable, access refused or request cancelled. Reading copies and recovery remain.")
    }
  } }
  private fun selected(hostId:String, token:String):JSONObject = synchronized(stateLock) {
    val state=read();require(token==epoch && state.optString("selected")==hostId) {"Connection changed; request cancelled."}
    JSONObject(state.getJSONObject("profiles").getJSONObject(hostId).toString())
  }
  private fun cancelRequests() {epoch=UUID.randomUUID().toString();stream?.disconnect();stream=null;requests.forEach {it.disconnect()};media.cancel()}
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
  private val browseSequence=java.util.concurrent.atomic.AtomicLong()
  @Volatile private var browseConnection:HttpsURLConnection?=null
  private fun request(p: JSONObject, path: String, method: String="GET", body: String?=null, secret: String?=null, revision: String?=null, token:String?=null, multipart:Boolean=false,browse:Long?=null): JSONObject {
    val cert=ca(p);require(fingerprint(cert)==p.getString("fingerprint")) { "Host identity changed; explicit pairing is required." }
    val con=URI(address(p.getString("address"))+"/api"+path).toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(cert).socketFactory
    con.connectTimeout=10000;con.readTimeout=15000;con.instanceFollowRedirects=false;con.requestMethod=method
    con.setRequestProperty("X-Vaultor-Protocol","3")
    if(path!="/capabilities" && p.optString("selectedWorkspaceId").isNotEmpty())con.setRequestProperty("X-Vaultor-Workspace",p.getString("selectedWorkspaceId"))
    if(p.has("credential")) con.setRequestProperty("Authorization","Bearer "+p.getString("credential"))
    if(secret!=null) con.setRequestProperty("X-Vaultor-Pairing",secret)
    if(revision!=null) con.setRequestProperty("If-Match",revision)
    try {
      if(browse!=null) {require(browse==browseSequence.get());browseConnection=con}
      if(token!=null) {requests.add(con);require(token==epoch) {"Connection changed."}}
      if(body!=null) {
        require(body.toByteArray().size <= 1500000);con.doOutput=true
        val bytes=if(multipart) {
          val payload=JSONObject(body);val boundary="vaultor-"+UUID.randomUUID();con.setRequestProperty("Content-Type","multipart/form-data; boundary=$boundary")
          listOfNotNull("title" to payload.getString("title"),"content" to payload.getJSONObject("content").toString(),payload.optString("collectionId").takeIf {it.isNotEmpty() && it!="null"}?.let {require(it.matches(Regex("[a-fA-F0-9-]{36}")));"collectionId" to it}).joinToString("") {(name,value)->"--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n"}.plus("--$boundary--\r\n").toByteArray(Charsets.UTF_8)
        } else {con.setRequestProperty("Content-Type","application/json");body.toByteArray(Charsets.UTF_8)}
        if(token!=null) require(token==epoch)
        con.outputStream.use { it.write(bytes) }
      }
      val status=con.responseCode
      require(status !in 300..399) { "Host redirects are refused." }
      val stream=if(status in 200..299) con.inputStream else con.errorStream
      val bytes=stream?.use { it.readNBytes(1500001) } ?: ByteArray(0)
      require(bytes.size<=1500000) { "Response exceeds the mobile document limit." }
      if(browse!=null) require(browse==browseSequence.get()) {"Obsolete browsing response."}
      return JSONObject().put("status",status).put("body",String(bytes,Charsets.UTF_8))
    } finally {requests.remove(con);if(browseConnection===con)browseConnection=null;con.disconnect()}
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
    synchronized(stateLock) {val state=read();val profiles=state.optJSONObject("profiles") ?: JSONObject();require(profiles.has(p.getString("hostId")) || profiles.length()<8) {"Remove a remembered host before pairing another."};profiles.optJSONObject(p.getString("hostId"))?.optString("selectedWorkspaceId")?.takeIf {it.isNotEmpty()}?.let {p.put("selectedWorkspaceId",it)};profiles.put(p.getString("hostId"),p);state.put("profiles",profiles);state.put("selected",p.getString("hostId"));state.put("profile",p);write(state);cancelRequests()};pending=null
    JSONObject().put("state","APPROVED").toString()
  }
  @ReactMethod fun profile(promise: Promise)=run(promise) {
    val p=read().optJSONObject("profile") ?: return@run "null"
    JSONObject().put("address",p.getString("address")).put("hostId",p.getString("hostId")).toString()
  }
  @ReactMethod fun api(path:String, method:String, body:String?, revision:String?, promise:Promise)=run(promise) {
    require(method=="GET") {"Mutations require the epoch-bound apiFor bridge."}
    require((method=="GET" && (path=="/capabilities" || path=="/workspace/identity" || path=="/settings/workspace" || path.matches(Regex("/workspaces(?:/[a-f0-9-]{36})?")) || path.matches(Regex("/resources(?:\\?page=0&size=30&type=note|/[a-fA-F0-9-]{36})")))) ||
      (method=="PUT" && path.matches(Regex("/resources/[a-fA-F0-9-]{36}/note")) && revision!=null)) {"Unsupported mobile operation."}
    val profile=read().getJSONObject("profile")
    if(path=="/capabilities") {
      val identity=json(request(profile,"/access/host"))
      require(identity.getString("hostId")==profile.getString("hostId") && identity.getString("fingerprint")==profile.getString("fingerprint")) {"Address serves a different host; verify it explicitly."}
    }
    request(profile,path,method,body,revision=revision).toString()
  }
  @ReactMethod fun journal(value:String,promise:Promise) {promise.reject("READ_ONLY","Legacy drafts are frozen; export recovery instead.")}
  @ReactMethod fun draft(promise:Promise)=run(promise) {read().optJSONObject("draft")?.toString() ?: "null"}
  @ReactMethod fun acknowledge(version:String,promise:Promise) {promise.reject("READ_ONLY","Legacy recovery cannot be acknowledged by the reader.")}

  @ReactMethod fun storage(action:String, input:String, promise:Promise)=run(promise) {
    require(action in listOf("bootstrap","getDraft","getCreation","getOrganization","getSession","putSession","getCache","putCache")) {"Legacy recovery records are frozen. Export them for desktop review."}
    // A save receipt may contain the prior document alongside a newer local edit.
    require(input.length<=(if(action=="putDraft")3010000 else 1500000));val a=JSONObject(input);val state=read()
    val drafts=state.optJSONObject("drafts") ?: JSONObject().also {state.put("drafts",it)}
    val sessions=state.optJSONObject("sessions") ?: JSONObject().also {state.put("sessions",it)}
    val cache=state.optJSONObject("cache") ?: JSONObject().also {state.put("cache",it)}
    fun entryKey():String {val scope=a.getString("scope");val id=a.getString("noteId");require(scope.length in 1..512 && id.matches(Regex("[a-fA-F0-9-]{36}")));val base=scope+"\n"+id;val record=a.optString("recoveryKey");require(record.isEmpty() || record==base+"\n"+a.getString("version"));return if(record.isEmpty())base else record}
    when(action) {
      "bootstrap" -> {
        val profiles=JSONArray();val p=state.optJSONObject("profiles") ?: JSONObject()
        p.keys().forEach {id->val value=p.getJSONObject(id);profiles.put(JSONObject().put("hostId",id).put("address",value.getString("address")).put("workspaceId",value.optString("selectedWorkspaceId")))}
        val list=JSONArray();drafts.keys().forEach {key->val d=drafts.getJSONObject(key);list.put(JSONObject().put("scope",d.getString("scope")).put("noteId",d.getString("noteId")).put("title",d.optString("title","Recovered note")).put("version",d.getString("version")).put("resolved",d.optBoolean("resolved")).put("recoveryKey",d.optString("recoveryKey")))}
        return@run JSONObject().put("profiles",profiles).put("selected",state.optString("selected")).put("epoch",epoch).put("drafts",list).put("sessions",sessions).toString()
      }
      "getDraft" -> return@run drafts.optJSONObject(entryKey())?.toString() ?: "null"
      "putDraft" -> {
        val key=entryKey();require(drafts.has(key) || drafts.length()<32) {"32 retained drafts reached. Resolve a draft before editing another note."}
        require(a.getString("version").length in 1..100 && a.getString("revision").length in 1..100 && a.getJSONObject("content").getString("type")=="doc")
        require(a.getJSONObject("content").toString().length<=1500000)
        a.optJSONObject("sent")?.let {require(it.getJSONObject("content").toString().length<=1500000 && it.getString("version").length in 1..100 && it.getString("revision").length in 1..100)}
        drafts.put(key,a);state.remove("draft")
      }
      "ackDraft","keepSaved" -> {
        val key=entryKey();val d=drafts.optJSONObject(key)
        if(d?.optString("version")==a.getString("version")) {
          if(action=="ackDraft") drafts.remove(key) else {val archive=key+"\n"+d.getString("version");d.put("resolved",true).put("recoveryKey",archive);drafts.remove(key);drafts.put(archive,d)}
          state.remove("draft")
        }
      }
      "getCreation" -> return@run state.optJSONObject("creations")?.optJSONObject(a.getString("scope"))?.toString() ?: "null"
      "putCreation","ackCreation" -> {
        val scope=a.getString("scope");require(scope.length in 1..512)
        val creations=state.optJSONObject("creations") ?: JSONObject().also {state.put("creations",it)}
        val id=a.getString("id");require(id.matches(Regex("[a-fA-F0-9-]{36}")))
        if(action=="putCreation") {
          require(creations.has(scope) || creations.length()<32) {"Resolve a pending creation first."}
          require(a.getString("title").trim().length in 1..500)
          creations.put(scope,a)
        } else if(creations.optJSONObject(scope)?.optString("id")==id) creations.remove(scope)
      }
      "getSession" -> return@run sessions.optJSONObject(a.getString("scope"))?.toString() ?: "null"
      "putSession" -> {
        val scope=a.getString("scope");require(scope.length in 1..512);a.put("at",System.currentTimeMillis());sessions.put(scope,a)
        while(sessions.length()>32) {val oldest=sessions.keys().asSequence().minBy {sessions.getJSONObject(it).optLong("at")};sessions.remove(oldest)}
      }
      "getOrganization" -> return@run state.optJSONObject("organizationPending")?.optJSONObject(a.getString("scope"))?.optJSONObject(a.getString("key"))?.toString() ?: "null"
      "putOrganization" -> {
        require(a.getString("scope").length<=500 && a.getString("key").length<=150 && a.getString("id").matches(Regex("[a-fA-F0-9-]{36}")))
        val all=state.optJSONObject("organizationPending") ?: JSONObject().also {state.put("organizationPending",it)}
        require(all.has(a.getString("scope")) || all.length()<32) {"Pending organization workspace limit reached."}
        val ops=all.optJSONObject(a.getString("scope")) ?: JSONObject().also {all.put(a.getString("scope"),it)}
        require(ops.has(a.getString("key")) || ops.length()<100) {"Resolve pending organization operations first."}
        ops.put(a.getString("key"),a)
      }
      "ackOrganization" -> {
        val all=state.optJSONObject("organizationPending");val ops=all?.optJSONObject(a.getString("scope"));val old=ops?.optJSONObject(a.getString("key"))
        if(old?.optString("id")==a.optString("id")) ops.remove(a.getString("key"))
        if(ops!=null && ops.length()==0)all.remove(a.getString("scope"))
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
  /** Preserves the existing key/storage. Only selected recovery fields leave native storage. */
  @ReactMethod fun legacyRecovery(action:String,promise:Promise) {
    if(action=="export") {executor.execute {try {val state=synchronized(stateLock){read()};val data=JSONObject().put("format","vaultor-legacy-recovery-1");for(name in listOf("drafts","draft","creations","organizationPending"))state.opt(name)?.let {data.put(name,it)};media.exportLegacy(data,promise)}catch(_:Exception){promise.reject("RECOVERY_EXPORT","Recovery cannot be read; encrypted originals remain.")}};return}
    run(promise) {
    require(action in listOf("inventory","export"))
    val state=read();val data=JSONObject().put("format","vaultor-legacy-recovery-1")
    for(name in listOf("drafts","draft","creations","organizationPending"))state.opt(name)?.let {data.put(name,it)}
    val items=JSONArray();var drafts=0;var creations=0;var operations=0
    state.optJSONObject("drafts")?.let {all->all.keys().forEach {k->val d=all.getJSONObject(k);drafts++;items.put(JSONObject().put("title",d.optString("title","Recovered note")).put("kind","Draft").put("scope",d.optString("scope")).put("status",if(d.has("sent"))"Uncertain save — not replayed" else "Retained local edit"))}}
    state.optJSONObject("creations")?.let {all->all.keys().forEach {k->val d=all.getJSONObject(k);creations++;items.put(JSONObject().put("title",d.optString("title","Pending creation")).put("kind","Creation").put("scope",k).put("status","Unknown outcome — not replayed"))}}
    state.optJSONObject("organizationPending")?.let {all->all.keys().forEach {scope->val ops=all.getJSONObject(scope);ops.keys().forEach {k->operations++;items.put(JSONObject().put("title",k).put("kind","Organization operation").put("scope",scope).put("status","Unknown outcome — not replayed"))}}}
    val inputs=media.legacyInventory();for(i in 0 until inputs.length())items.put(inputs.getJSONObject(i))
    JSONObject().put("drafts",drafts).put("creations",creations).put("operations",operations).put("inputs",inputs.length()).put("items",items).toString()
  }
  }
  @ReactMethod fun uuid(promise:Promise)=run(promise) {JSONObject().put("id",UUID.randomUUID().toString()).toString()}
  @ReactMethod fun editorKeyboard(show:Boolean) { /* No editable document/IME bridge in R1. */ }
  @ReactMethod fun isKeyboardVisible(promise:Promise) {
    ctx.runOnUiQueueThread {
      promise.resolve(ctx.currentActivity?.window?.decorView?.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime())==true)
    }
  }
  private fun checkedDestination(p:JSONObject,token:String) {
    val h=json(request(p,"/access/host",token=token));require(h.getString("hostId")==p.getString("hostId") && h.getString("fingerprint")==p.getString("fingerprint"))
    val caps=json(request(p,"/capabilities",token=token));require(caps.getInt("apiProtocolVersion")>=3 && caps.getInt("minimumClientProtocolVersion")<=3)
    val identity=json(request(p,"/workspace/identity",token=token));val selected=p.optString("selectedWorkspaceId");require(selected.isEmpty() || selected==identity.getString("id")) {"Destination workspace identity differs."}
  }
  @ReactMethod fun selectWorkspace(hostId:String,token:String,id:String,generation:String,promise:Promise)=net(promise) {
    require(id.matches(Regex("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")))
    val p=selected(hostId,token);p.put("selectedWorkspaceId",id);checkedDestination(p,token)
    val identity=json(request(p,"/workspace/identity",token=token));require(identity.getString("generation")==generation) {"Destination was replaced. Retry."}
    synchronized(stateLock){val state=read();require(token==epoch && state.optString("selected")==hostId);state.getJSONObject("profiles").put(hostId,p);state.put("profile",p);write(state);cancelRequests()}
    JSONObject().put("hostId",hostId).put("epoch",epoch).put("address",p.getString("address")).put("workspaceId",id).toString()
  }
  @ReactMethod fun activate(hostId:String, promise:Promise)=net(promise) {
    val captured=epoch;val p=synchronized(stateLock){JSONObject(read().getJSONObject("profiles").getJSONObject(hostId).toString())};checkedDestination(p,captured)
    synchronized(stateLock){require(captured==epoch);val state=read();state.put("selected",hostId);state.put("profile",p);write(state);cancelRequests()}
    JSONObject().put("hostId",hostId).put("epoch",epoch).put("address",p.getString("address")).put("workspaceId",p.optString("selectedWorkspaceId")).toString()
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
  private fun organizationPath(path:String,method:String,revision:String?):Boolean {
    val id="[a-fA-F0-9-]{36}"
    if(method=="GET" && path.matches(Regex("/(collections/$id|resources/$id/(usage|lifecycle-pending))")))return true
    if(method=="GET" && path.matches(Regex("/resources/$id/references\\?direction=(incoming|outgoing)&page=[0-9]{1,6}&size=30")))return true
    if(method=="GET" && path.substringBefore("?") in listOf("/collections","/tags/browse","/resources","/resources/trash")) {try {validateBrowsePath(path);return true}catch(_:Exception){return false}}
    return false
  }
  @ReactMethod fun apiFor(hostId:String,token:String,path:String,method:String,body:String?,revision:String?,promise:Promise)=net(promise) {
    val validId="[a-fA-F0-9-]{36}"
    require(method=="GET" || (method=="POST" && path.matches(Regex("/resources/$validId/open")) && body==null)) {"Android is read-only. Legacy writes are never replayed."}
    require(organizationPath(path,method,revision) || (method=="GET" && (path=="/capabilities" || path=="/workspace/identity" || path=="/settings/workspace" || path.matches(Regex("/workspaces(?:/[a-f0-9-]{36})?")) || path.matches(Regex("/resources(?:\\?page=0&size=30&type=note|/$validId)")))) ||
      (method=="GET" && path.matches(Regex("/resources/$validId/summary"))) || (method=="POST" && path.matches(Regex("/resources/$validId/open")) && body==null)) {"Unsupported mobile operation."}
    val p=selected(hostId,token)
    if(path=="/capabilities") {val h=json(request(p,"/access/host",token=token));require(h.getString("hostId")==hostId && h.getString("fingerprint")==p.getString("fingerprint"))}
    request(p,path,method,body,revision=revision,token=token,multipart=path.contains("/imports/")).toString()
  }

  private fun validateBrowsePath(path:String) {
    require(path.length<=12000);val uri=URI(path)
    require(uri.scheme==null && uri.rawAuthority==null && uri.fragment==null && uri.path in listOf("/resources","/resources/query","/resources/trash","/collections","/tags/browse","/organization/pins"))
    val seen=HashSet<String>()
    for(pair in (uri.rawQuery ?: "").split("&").filter {it.isNotEmpty()}) {
      val pieces=pair.split("=",limit=2);require(pieces.size==2)
      val key=java.net.URLDecoder.decode(pieces[0],"UTF-8");val value=java.net.URLDecoder.decode(pieces[1],"UTF-8");require(seen.add(key))
      require(when(key) {
        "page" -> value.toIntOrNull()?.let {it in 0..100000} ?: false
        "size" -> value.toIntOrNull()?.let {it in 1..100} ?: false
        "q" -> value.length<=1000
        "type" -> value in listOf("note","file")
        "kind" -> value in listOf("note","file","collection")
        "category" -> value in listOf("image","pdf","audio","video","text","other")
        "collection" -> value.matches(Regex("[a-fA-F0-9-]{36}"))
        "favorites" -> value in listOf("true","false")
        "sort" -> value in listOf("title","updated","recent")
        else -> false
      }) {"Unsupported browsing parameter."}
    }
  }
  @ReactMethod fun cancelBrowse() {browseSequence.incrementAndGet();browseConnection?.disconnect();browseConnection=null}
  @ReactMethod fun browseApiFor(hostId:String,token:String,path:String,promise:Promise) {
    val ticket=browseSequence.incrementAndGet();browseConnection?.disconnect()
    net(promise) {validateBrowsePath(path);require(ticket==browseSequence.get());val p=selected(hostId,token);request(p,path,token=token,browse=ticket).toString()}
  }

  @ReactMethod fun addListener(name:String) {} // Required NativeEventEmitter lifecycle surface.
  @ReactMethod fun removeListeners(count:Double) {}
  @ReactMethod fun stopChanges() {stream?.disconnect();stream=null}
  @ReactMethod fun startChanges(hostId:String,token:String,cursor:String,promise:Promise)=run(promise) {
    require(cursor.length<=128 && (cursor.isEmpty() || cursor.matches(Regex("[a-zA-Z0-9:-]+"))))
    val p=selected(hostId,token);stream?.disconnect()
    val con=URI(address(p.getString("address"))+"/api/changes"+if(cursor.isEmpty())"" else "?cursor=$cursor").toURL().openConnection() as HttpsURLConnection
    con.sslSocketFactory=context(ca(p)).socketFactory;con.connectTimeout=10000;con.readTimeout=20000;con.instanceFollowRedirects=false
    con.setRequestProperty("Authorization","Bearer "+p.getString("credential"));con.setRequestProperty("X-Vaultor-Protocol","3");con.setRequestProperty("Accept","text/event-stream");if(p.optString("selectedWorkspaceId").isNotEmpty())con.setRequestProperty("X-Vaultor-Workspace",p.getString("selectedWorkspaceId"));stream=con
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
