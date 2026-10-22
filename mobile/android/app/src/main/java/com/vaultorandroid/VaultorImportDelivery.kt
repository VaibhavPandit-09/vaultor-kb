package com.vaultorandroid
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/** Import-specific state machine. Unknown results can only replay the identical durable intent. */
class VaultorImportDelivery(private val store:VaultorImports,private val port:Port) {
  interface Port {fun admit(row:JSONObject);fun request(row:JSONObject,path:String,upload:Boolean=false):JSONObject}
  class Refusal(val reason:String,val retryable:Boolean=false):Exception(reason)
  companion object {val busy=AtomicBoolean(false)}
  private fun body(result:JSONObject):JSONObject {
    val status=result.getInt("status");val raw=try{JSONObject(result.optString("body","{}"))}catch(_:Exception){JSONObject()}
    if(status !in 200..299)throw Refusal(raw.optString("code","HOST_REFUSED"),status==409&&raw.optString("code")=="WORKSPACE_BUSY"||status==429||status>=500)
    return raw
  }
  private fun receipt(row:JSONObject,r:JSONObject) {
    val input=row.getJSONObject("intent");val source=row.getJSONObject("source")
    require(r.optInt("version")==1&&r.optString("id")==row.getString("id")){"Receipt operation differs"}
    if(row.getString("mode")=="workspaceZip"){
      val actual=r.getJSONObject("input");for(key in listOf("hostId","workspaceId","generation","filename","sha256","name","bytes"))require(actual.optString(key)==input.optString(key)){"ZIP receipt intent differs"}
      require(r.optString("state") in listOf("AWAITING_OWNER","PREVIEWED","APPROVED","SUCCEEDED","REJECTED")){"Invalid ZIP receipt"}
      if(r.optString("state")=="SUCCEEDED")require(r.optString("destinationWorkspaceId")==row.getString("id")){"ZIP result differs"}
    } else {
      require(r.optString("workspaceId")==source.getString("workspaceId")&&r.optString("generation")==source.getString("generation")&&r.optString("resourceId")==row.getString("id")){"Import receipt source differs"}
      for(key in listOf("sha256","filename","bytes","collectionId"))require(r.optString(key)==input.optString(key)){"Import receipt payload differs"}
      require(r.optString("kind")==if(row.getString("mode")=="original")"file" else "note"){"Import result kind differs"}
      val canonical=listOf("generation","filename","mime","sha256","bytes","mode","collectionId").joinToString("\u0000"){if(input.isNull(it))"" else input.get(it).toString()}
      val fingerprint=java.security.MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
      require(r.optString("fingerprint")==fingerprint){"Immutable import acknowledgment differs"}
    }
  }
  fun sync(force:Boolean=false):JSONObject {
    if(!busy.compareAndSet(false,true))return JSONObject().put("busy",true)
    try {var delivered=0
      for(snapshot in store.rows().filter {it.optString("state") in listOf("queued","unknown","sending","waitingOwner")&& (force||it.optLong("nextAttemptAt")<=System.currentTimeMillis())}.take(16)){
        val id=snapshot.getString("id")
        try {
          port.admit(snapshot);store.original(snapshot){} // Verify all authenticated chunks before sending anything.
          val row=store.claim(id);val zip=row.getString("mode")=="workspaceZip";val path=if(zip)"/collected-zips/$id" else "/resources/collected-imports/$id"
          val response=body(port.request(row,path,upload=!zip||!row.optBoolean("submitted")));receipt(row,response)
          // The ordinary host commit checks generation atomically. ZIP GET also rechecks source grants/generation.
          if(zip&&response.getString("state")!="SUCCEEDED"){
            val current=store.item(id).put("submitted",true);store.save(current)
            store.outcome(id,if(response.getString("state")=="REJECTED")"needsAttention" else "waitingOwner",if(response.getString("state")=="REJECTED")"Host owner rejected this archive. Original remains on this device." else "Exact ZIP retained by host. Waiting for owner inspection and import-as-new authorization.")
          }else {store.outcome(id,"acknowledged",if(zip)"Owner-authorized new workspace created. Access requires an explicit host grant." else "Host resource created. Refresh connected or downloaded content to include it.",response);delivered++}
        }catch(e:Exception){
          val refusal=e as? Refusal;val retry=refusal?.retryable ?: (e is java.io.IOException)
          if(refusal?.reason in listOf("IMPORT_COLLECTION_UNAVAILABLE","IMPORT_ENCODING_UNSUPPORTED","IMPORT_CONVERSION_LIMIT"))store.rejection(id,refusal!!.reason)
          val row=store.item(id);store.outcome(id,if(retry)if(row.optBoolean("attempted"))"unknown" else "queued" else "needsAttention",when(refusal?.reason){"METERED_PAUSED"->"Automatic upload paused on metered network. Allow this item explicitly or use Wi-Fi.";"IMPORT_GENERATION_CHANGED"->"Workspace replaced. Import remains bound to its original source.";"IMPORT_COLLECTION_UNAVAILABLE"->"Confirmed collection no longer exists. Original input is retained; workspace root is never selected automatically.";"IMPORT_ENCODING_UNSUPPORTED"->"Host cannot convert this encoding. Original bytes are retained for recovery.";"IMPORT_CONVERSION_LIMIT"->"Host conversion limit exceeded. Original bytes are retained; this operation is not silently changed to a file import.";"APPROVAL_REQUIRED"->"Original source approval or local-network permission required. Input retained.";else->refusal?.reason?.replace('_',' ') ?: (e.message ?: "Delivery unavailable. Original and immutable operation retained.")})
        }
      }
      return JSONObject().put("busy",false).put("delivered",delivered)
    }finally{busy.set(false)}
  }
}
