package com.vaultorandroid

import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Development-only, one ephemeral interaction, no disk/log/content identifiers. */
internal class CaptureFeedbackTrace(private val enabled:Boolean) {
  private var id=""
  private var started=0L
  private var sealed=false
  private var dropped=0
  private val records=ArrayDeque<JSONObject>()
  val measuring get()=enabled && id.isNotEmpty() && !sealed
  companion object {
    private val stages=setOf("capture_accepted","draft_ready","draft_failed","sheet_settled","anchor_started","anchor_finished","anchor_cancelled","save_accepted","durable_save","save_failed","receipt_started","receipt_finished","receipt_cancelled","completion_check","keyboard_hidden","composer_closed","js_emit","js_suppressed","js_bridge_result","js_bridge_failed","bridge_received","bridge_rejected","native_admission","native_result","mechanism_selected","platform_request","platform_result","platform_exception","host_paused","host_destroyed")
    private val booleans=setOf("keyboardVisible","geometryDone","alive","viewPresent","finished","reduced","enabled","active","validTag","appEnabled","resumed","attached","shown","windowFocused","viewEnabled","actuator","clickPrimitive","envelopeUsable","androidAccepted","submitted")
    private val enums=mapOf(
      "event" to setOf("selection","complete","reject"),
      "reason" to setOf("admitted","application haptics off","Android touch haptics off","application not resumed","source view not visible","source window not focused","source view haptics disabled","invalid semantic event","invalid_token","invalid_event","duplicate_token","bridge_exception","Android declined system feedback; no supported permitted fallback"),
      "route" to setOf("system","primitives","predefined","envelope","silent"),
      "status" to setOf("requested","suppressed","rejected"),
      "mechanism" to setOf("system","custom","exception"),
      "effect" to setOf("CLOCK_TICK","GESTURE_END","CONFIRM","REJECT","LONG_PRESS","CLICK","CLICK_PAIR","THUD","TICK","HEAVY_CLICK","DOUBLE_CLICK","BASIC_ENVELOPE"),
      "pattern" to setOf("","REVIEW_CAPTURED")
    )
  }
  fun arm():String {
    check(enabled)
    id=UUID.randomUUID().toString();started=SystemClock.elapsedRealtime();sealed=false;dropped=0;records.clear()
    return snapshot()
  }
  fun clear():String { check(enabled);id="";records.clear();sealed=false;dropped=0;return snapshot() }
  fun seal():String { check(enabled);sealed=true;return snapshot() }
  fun lifecycle(stage:String) { record(id,stage) }
  fun record(token:String,stage:String,facts:JSONObject=JSONObject(),jsMs:Double?=null) {
    if(!measuring || token!=id || stage !in stages)return
    val row=JSONObject().put("stage",stage).put("nativeMs",SystemClock.elapsedRealtime()-started)
    if(jsMs!=null && jsMs.isFinite() && jsMs in 0.0..86400000.0)row.put("jsMs",jsMs)
    for(key in booleans)if(facts.opt(key) is Boolean)row.put(key,facts.getBoolean(key))
    for((key,values) in enums)if(facts.opt(key) is String && facts.getString(key) in values)row.put(key,facts.getString(key))
    val setting=facts.opt("systemSetting");if(setting is Number && setting.toInt() in -1..1)row.put("systemSetting",setting.toInt())
    if(records.size==128){records.removeFirst();dropped++}
    records.addLast(row)
  }
  fun snapshot():String {
    check(enabled)
    return JSONObject().put("schema",1).put("id",id).put("sealed",sealed).put("dropped",dropped)
      .put("clock","nativeMs: elapsed since arm; jsMs: JS elapsed since arm response; compare within each clock")
      .put("records",JSONArray(records.toList())).toString()
  }
}
