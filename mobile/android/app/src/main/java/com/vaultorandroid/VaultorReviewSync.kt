package com.vaultorandroid

import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/** R6 single native owner. Never activates a workspace or writes original resources. */
class VaultorReviewSync(private val journal:VaultorReviews, private val port:Port, private val clock:()->Long=System::currentTimeMillis, private val changed:()->Unit={}) {
  interface Port { fun request(source:JSONObject,path:String,method:String="GET",body:String?=null):JSONObject }
  class Failure(val reason:String,val retryable:Boolean=false):Exception(reason)
  companion object { private val owner=AtomicBoolean(false); fun busy()=owner.get() }
  private fun body(result:JSONObject):JSONObject {
    val status=result.getInt("status")
    if(status !in 200..299) {
      val raw=try {JSONObject(result.optString("body")).optString("code")}catch(_:Exception){""}
      val reason=when {
        status in listOf(401,403)->"APPROVAL_REQUIRED"
        raw in listOf("REVIEW_ID_REUSED","REVIEW_GENERATION_CHANGED","REVIEW_LIMIT","RESOURCE_NOT_FOUND","WORKSPACE_UNAVAILABLE","REVIEW_NOT_FOUND","REVIEW_CONFLICT")->raw
        status==404->"SOURCE_UNAVAILABLE"
        status==409 || status==503->"HOST_BUSY"
        status==429 || status>=500->"HOST_UNAVAILABLE"
        else->"REQUEST_REJECTED"
      }
      throw Failure(reason,reason in listOf("HOST_BUSY","HOST_UNAVAILABLE"))
    }
    return try {JSONObject(result.getString("body"))}catch(_:Exception){throw Failure("INVALID_RECEIPT")}
  }
  private fun admit(source:JSONObject) {
    val host=body(port.request(source,"/access/host"))
    if(host.optString("hostId")!=source.getString("hostId"))throw Failure("HOST_IDENTITY_CHANGED")
    val identity=body(port.request(source,"/workspace/identity"))
    if(identity.optString("id")!=source.getString("workspaceId"))throw Failure("SOURCE_UNAVAILABLE")
    if(identity.optString("generation")!=source.getString("generation"))throw Failure("REVIEW_GENERATION_CHANGED")
    val capabilities=body(port.request(source,"/capabilities"))
    if(capabilities.optInt("reviews")!=1)throw Failure("REVIEWS_UNSUPPORTED")
  }
  private fun receipt(item:JSONObject,result:JSONObject):JSONObject {
    val input=item.getJSONObject("body")
    if(result.optString("id")!=item.getString("id") || result.optString("resourceId")!=input.getString("resourceId"))throw Failure("INVALID_RECEIPT")
    for(name in listOf("comment","quote","context"))if(result.optString(name)!=input.optString(name))throw Failure("RECEIPT_CONFLICT")
    val actual=result.optJSONObject("locator") ?: throw Failure("RECEIPT_CONFLICT")
    val expected=input.getJSONObject("locator")
    if(actual.optString("kind")!=expected.getString("kind"))throw Failure("RECEIPT_CONFLICT")
    for(name in listOf("path","page")) {
      val a=actual.opt(name).takeUnless {it==JSONObject.NULL};val e=expected.opt(name).takeUnless {it==JSONObject.NULL}
      if(a?.toString()!=e?.toString())throw Failure("RECEIPT_CONFLICT")
    }
    if(result.optString("status") !in listOf("open","resolved","dismissed") || result.optString("revision").length !in 1..100)throw Failure("INVALID_RECEIPT")
    val safe=JSONObject()
    for(name in listOf("id","resourceId","status","revision","author","createdAt","updatedAt","availability","attachment")) {
      val value=result.optString(name);if(value.length>500)throw Failure("INVALID_RECEIPT");safe.put(name,value)
    }
    return safe
  }
  fun sync(force:Boolean=false,refresh:Boolean=false):JSONObject {
    if(!owner.compareAndSet(false,true))return JSONObject().put("busy",true)
    try {
      val now=clock();val records=journal.snapshot().filter {it.getString("state")=="queued"}
      fun due(item:JSONObject):Boolean {
        val d=item.optJSONObject("delivery") ?: return true
        if(force)return true
        if(d.optString("reason").isNotEmpty() && !d.optBoolean("retryable"))return false
        return d.optLong("nextAttemptAt")<=now
      }
      val pending=records.filter {it.optJSONObject("delivery")?.optString("state")!="synced" && due(it)}.sortedBy {it.optJSONObject("delivery")?.optLong("checkedAt") ?: 0L}.take(if(force)256 else 32)
      val synced=records.filter {it.optJSONObject("delivery")?.optString("state")=="synced" && (refresh || due(it))}.sortedBy {it.optJSONObject("delivery")?.optLong("checkedAt") ?: 0L}.take(if(force)256 else 32)
      val admissions=mutableMapOf<String,Exception?>();var delivered=0;var attention=0;var checked=0
      for(item in pending+synced) {
        val id=item.getString("id");val source=item.getJSONObject("source")
        val d=JSONObject(item.optJSONObject("delivery")?.toString() ?: "{}")
        val wasSynced=d.optString("state")=="synced" || d.has("receipt")
        var dispatched=false
        try {
          val key=listOf("hostId","workspaceId","generation").joinToString("\n"){source.getString(it)}
          if(!admissions.containsKey(key))admissions[key]=try {admit(source);null}catch(e:Exception){e}
          admissions[key]?.let {throw it}
          val response=if(!wasSynced) {
            // Persistence precedes network dispatch. A crash here remains an uncertain exact retry.
            d.put("state","sending").put("attempted",true).put("attempts",d.optInt("attempts")+1).put("checkedAt",now)
            journal.delivery(id,d);changed();dispatched=true
            body(port.request(source,"/reviews/$id","PUT",item.getJSONObject("body").toString()))
          } else body(port.request(source,"/reviews/$id"))
          if(wasSynced) {
            // GET receipts omit generation. Reject a replacement during reconciliation.
            val after=body(port.request(source,"/workspace/identity"))
            if(after.optString("id")!=source.getString("workspaceId"))throw Failure("SOURCE_UNAVAILABLE")
            if(after.optString("generation")!=source.getString("generation"))throw Failure("REVIEW_GENERATION_CHANGED")
          }
          val accepted=receipt(item,response)
          d.put("state","synced").put("receipt",accepted).put("reason","").put("uncertain",false).put("retryable",true).put("checkedAt",now).put("nextAttemptAt",now+30000)
          journal.delivery(id,d);changed();if(!wasSynced)delivered++;checked++
        } catch(e:Exception) {
          // Storage failures must escape; never claim a persisted receipt or continue sending.
          if(e is java.io.IOException && !dispatched && d.optString("state")=="sending")throw e
          val failure=e as? Failure
          if(dispatched && e is java.io.IOException && d.has("receipt"))throw e
          val retryable=failure?.retryable ?: true
          val uncertain=!wasSynced && (dispatched || d.optBoolean("attempted"))
          d.put("state",if(wasSynced)"synced" else if(retryable)if(uncertain)"unknown" else "queued" else "error")
            .put("reason",failure?.reason ?: "HOST_UNAVAILABLE").put("uncertain",uncertain).put("retryable",retryable).put("checkedAt",now)
            .put("nextAttemptAt",if(retryable)now+minOf(300000L,2000L*(1L shl minOf(7,d.optInt("attempts")))) else 0L)
          journal.delivery(id,d);changed();attention++
        }
      }
      return JSONObject().put("busy",false).put("delivered",delivered).put("checked",checked).put("attention",attention)
    } finally {owner.set(false)}
  }
}
