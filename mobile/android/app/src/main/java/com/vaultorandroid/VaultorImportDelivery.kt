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
      require(r.optString("state") in listOf("RECEIVING","AWAITING_OWNER","PREVIEWED","APPROVED","SUCCEEDED","REJECTED","CANCELLED","EXPIRED","FAILED")){"Invalid ZIP receipt"}
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
  fun applyZipReceipt(row:JSONObject,response:JSONObject):Boolean {
    receipt(row,response)
    val id=row.getString("id")
    return when(response.getString("state")){
      "SUCCEEDED"->{store.outcome(id,"acknowledged","Owner-authorized new workspace created. Access requires an explicit host grant.",response);true}
      "REJECTED","CANCELLED","EXPIRED","FAILED"->{
        val state=response.getString("state")
        val detail=when(state){
          "REJECTED"->"The host owner rejected this backup."
          "CANCELLED"->"The host confirmed cancellation."
          "EXPIRED"->"The owner review window expired."
          else->"The host could not verify or restore this backup."
        }
        store.outcome(id,"needsAttention","$detail Original remains on this device.",response);false
      }
      "RECEIVING"->{store.outcome(id,"unknown","Host has an incomplete upload. Retry will resend the same archive.");false}
      else->{
        store.save(store.item(id).put("submitted",true))
        val detail=if(response.getString("state")=="APPROVED")"Owner approved. Restoring as a new workspace." else "Backup uploaded. Waiting for the host owner to review it."
        store.outcome(id,"waitingOwner",detail);false
      }
    }
  }
  fun sync(force:Boolean=false):JSONObject {
    if(!busy.compareAndSet(false,true))return JSONObject().put("busy",true)
    try {var delivered=0
      for(snapshot in store.rows().filter {it.optString("state") in listOf("queued","unknown","sending","waitingOwner")&& (force||it.optLong("nextAttemptAt")<=System.currentTimeMillis())}.take(16)){
        val id=snapshot.getString("id")
        try {
          port.admit(snapshot)
          val row=store.claim(id);val zip=row.getString("mode")=="workspaceZip";val path=if(zip)"/collected-zips/$id" else "/resources/collected-imports/$id"
          if(zip && snapshot.optBoolean("attempted")){
            val prior=port.request(row,path)
            if(prior.getInt("status")!=404){
              val known=body(prior);receipt(row,known)
              if(known.getString("state")!="RECEIVING"){
                if(applyZipReceipt(row,known))delivered++
                continue
              }
            }
          }
          store.original(row){} // Verify all authenticated chunks before sending anything.
          val response=body(port.request(row,path,upload=true))
          if(zip){if(applyZipReceipt(row,response))delivered++}
          else {receipt(row,response);store.outcome(id,"acknowledged","Host resource created. Refresh connected or downloaded content to include it.",response);delivered++}
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
