package com.vaultorandroid

import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Independent, non-evictable encrypted capture journal. No transport or original writes. */
class VaultorReviews(path: File, private val key: () -> SecretKey) {
  private val file = AtomicFile(path)
  companion object { private val lock = Any() }
  private fun text(a:JSONObject, name:String, max:Int, required:Boolean=false):String {
    val v=a.optString(name, "")
    require(v.length<=max && (!required || v.isNotBlank()) && v.none{it.code==0 || it.code<32 && it !in "\n\r\t"}) {"Invalid review $name or length."}
    return v
  }
  private fun uuid(v:String):String {require(v.matches(Regex("[a-fA-F0-9-]{36}")));return UUID.fromString(v).toString()}
  private fun read():JSONObject {
    if(!file.baseFile.exists())return JSONObject().put("version",1).put("items",JSONObject())
    val bytes=file.readFully();require(bytes.size in 29..8388636){"Capture journal is invalid; bytes retained."}
    val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
    val value=JSONObject(String(c.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8))
    require(value.getInt("version")==1){"Unsupported capture journal; bytes retained."};return value
  }
  private fun write(value:JSONObject) {
    val bytes=value.toString().toByteArray(Charsets.UTF_8)
    require(bytes.size<=8388608){"Capture storage is full. Existing evidence is retained."}
    val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key())
    val encrypted=c.iv+c.doFinal(bytes);val out=file.startWrite()
    try{out.write(encrypted);file.finishWrite(out)}catch(e:Exception){file.failWrite(out);throw e}
  }
  fun execute(action:String,a:JSONObject):String = synchronized(lock) {
    val journal=read();val items=journal.getJSONObject("items")
    when(action) {
      "list" -> JSONArray(items.keys().asSequence().map{items.getJSONObject(it)}.sortedByDescending{it.getString("createdAt")}.toList()).toString()
      "begin" -> {
        require(items.length()<256){"Capture limit reached (256). Existing evidence is retained."}
        val scope=JSONArray(a.getString("scope"));require(scope.length()==3)
        val host=uuid(scope.getString(0));val workspace=uuid(scope.getString(1));val generation=text(JSONObject().put("generation",scope.getString(2)),"generation",100,true)
        val type=a.getString("targetType");require(type in listOf("note","file"))
        val locator=a.getJSONObject("locator");val kind=locator.getString("kind")
        when(kind) {
          "resource" -> require(!locator.has("path") && !locator.has("page"))
          "block" -> require(type=="note" && !locator.has("page") && locator.getString("path").length<=300 && locator.getString("path").matches(Regex("[0-9]{1,5}(?:\\.[0-9]{1,5}){0,63}")))
          "page" -> require(type=="file" && a.optString("mimeType")=="application/pdf" && !locator.has("path") && locator.getDouble("page")==locator.getInt("page").toDouble() && locator.getInt("page") in 1..100000)
          else -> error("Unsupported review locator.")
        }
        val body=JSONObject().put("generation",generation).put("resourceId",uuid(a.getString("resourceId"))).put("baseRevision",text(a,"baseRevision",100)).put("quote",text(a,"quote",4000)).put("context",text(a,"context",4000)).put("locator",JSONObject(locator.toString())).put("comment","")
        val source=JSONObject().put("hostId",host).put("workspaceId",workspace).put("generation",generation).put("address",text(a,"address",2048)).put("workspaceName",text(a,"workspaceName",500)).put("targetTitle",text(a,"targetTitle",500,true)).put("targetType",type)
        val id=UUID.randomUUID().toString();val item=JSONObject().put("id",id).put("version",0).put("state","draft").put("createdAt",Instant.now().toString()).put("source",source).put("body",body)
        items.put(id,item);write(journal);item.toString()
      }
      "put", "queue", "discard" -> {
        val id=uuid(a.getString("id"));val item=items.getJSONObject(id)
        if(action=="queue" && item.getString("state")=="queued")return@synchronized item.toString()
        require(item.getString("state")=="draft" && item.getInt("version")==a.getInt("version")){"Capture changed. Reopen the retained draft before editing."}
        if(action=="discard"){items.remove(id);write(journal);return@synchronized "{}"}
        if(action=="put")item.getJSONObject("body").put("comment",text(a,"comment",5000))
        else {text(item.getJSONObject("body"),"comment",5000,true);item.put("state","queued")}
        item.put("version",item.getInt("version")+1);write(journal);item.toString()
      }
      else -> error("Unsupported capture action.")
    }
  }
}
