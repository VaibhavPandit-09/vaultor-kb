package com.vaultorandroid

import android.content.Context
import android.graphics.Rect
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.HapticFeedbackConstants as H
import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.LifecycleState
import org.json.JSONObject

/** Semantic device feedback. Capability means requestable, never "felt". */
class VaultorHaptics(private val ctx:ReactApplicationContext, private val vibrator:Vibrator) {
  companion object {
    val events=setOf("micro","selection","complete","reject","destructive")
    fun constant(event:String)=when(event){"micro"->H.CLOCK_TICK;"selection"->H.GESTURE_END;"reject"->H.REJECT;"destructive"->H.LONG_PRESS;else->H.CONFIRM}
    fun label(event:String)=when(event){"micro"->"CLOCK_TICK";"selection"->"GESTURE_END";"reject"->"REJECT";"destructive"->"LONG_PRESS";else->"CONFIRM"}
    fun effect(event:String)=when(event){"micro"->VibrationEffect.EFFECT_TICK;"reject"->VibrationEffect.EFFECT_DOUBLE_CLICK;"complete","destructive"->VibrationEffect.EFFECT_HEAVY_CLICK;else->VibrationEffect.EFFECT_CLICK}
    fun fallback(event:String,enabled:Boolean,thud:Boolean,preset:Boolean)=if(!enabled)"silent" else if(event=="destructive"){if(thud)"thud" else "silent"}else if(preset)"predefined" else "silent"
    fun route(event:String,rich:String,policy:String,allowed:Boolean,actuator:Boolean,envelope:Boolean,click:Boolean,preset:Boolean):String {
      if(!allowed || event !in events)return "silent"
      val spatial=(event=="selection" && rich=="anchor") || (event=="complete" && rich=="capture")
      if(!spatial || policy=="platform" || !actuator)return "system"
      if(policy=="expressive" && envelope)return "envelope"
      return if(click)"primitives" else if(preset)"predefined" else "system"
    }
  }
  private fun preferences()=try{JSONObject(ctx.getSharedPreferences("reader-presentation-v1",Context.MODE_PRIVATE).getString("preferences","{}")?:"{}")}catch(_:Exception){JSONObject()}
  private fun supported(effect:Int)=vibrator.areEffectsSupported(effect).firstOrNull()==Vibrator.VIBRATION_EFFECT_SUPPORT_YES
  private fun envelope():Boolean=try{
    if(!vibrator.areEnvelopeEffectsSupported())false else vibrator.envelopeEffectInfo.let {
      it.maxSize>=4 && it.minControlPointDurationMillis<=40 && it.maxControlPointDurationMillis>=40 && it.maxDurationMillis>=160
    }
  }catch(_:Exception){false}
  fun snapshot(v:View?):JSONObject {
    val prefs=preferences()
    return JSONObject().put("systemSetting",Settings.System.getInt(ctx.contentResolver,Settings.System.HAPTIC_FEEDBACK_ENABLED,-1))
      .put("appEnabled",prefs.optString("haptics","system")!="off").put("richPolicy",prefs.optString("richHaptics","clear"))
      .put("resumed",ctx.lifecycleState==LifecycleState.RESUMED).put("attached",v?.isAttachedToWindow==true)
      .put("shown",v?.isShown==true && v.getGlobalVisibleRect(Rect())).put("windowFocused",v?.hasWindowFocus()==true).put("viewEnabled",v?.isHapticFeedbackEnabled==true)
      .put("actuator",vibrator.hasVibrator()).put("amplitudeControl",vibrator.hasAmplitudeControl())
      .put("envelopeSupported",vibrator.areEnvelopeEffectsSupported()).put("envelopeUsable",envelope())
      .put("legacyEnvelopeUsable",envelope() && vibrator.envelopeEffectInfo.minControlPointDurationMillis<=20)
      .put("clickPrimitive",vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK))
      .put("tickPrimitive",vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK))
      .put("thudPrimitive",vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_THUD))
      .put("clickEffect",supported(VibrationEffect.EFFECT_CLICK)).put("heavyEffect",supported(VibrationEffect.EFFECT_HEAVY_CLICK))
      .put("doubleEffect",supported(VibrationEffect.EFFECT_DOUBLE_CLICK)).put("tickEffect",supported(VibrationEffect.EFFECT_TICK))
  }
  fun describe(event:String,rich:String,v:View?):JSONObject {
    val report=snapshot(v)
    val selected=route(event,rich,report.getString("richPolicy"),report.getBoolean("appEnabled") && report.getInt("systemSetting")!=0,report.getBoolean("actuator"),report.getBoolean("envelopeUsable"),report.getBoolean("clickPrimitive"),supported(if(rich=="capture")VibrationEffect.EFFECT_DOUBLE_CLICK else effect(event)))
    return report.put("plannedRoute",if(report.getInt("systemSetting")==-1 && selected!="silent")"system" else selected)
      .put("platformConstant",label(event)).put("preset",effect(event))
      .put("fallback",if(event=="destructive")"supported THUD .9 if Android declines; otherwise silent (never duplicate completion preset)" else if(rich.isEmpty())"supported short preset if Android declines; otherwise silent" else "supported CLICK → supported preset → system → silent")
  }
  fun play(event:String,rich:String,v:View?,mode:String="auto"):JSONObject {
    val report=snapshot(v).put("event",event).put("profile",rich).put("requestedMode",mode)
    val reason=when {
      event !in events || rich !in setOf("","anchor","capture")->"invalid semantic event"
      !report.getBoolean("appEnabled")->"application haptics off"
      report.getInt("systemSetting")==0->"Android touch haptics off"
      !report.getBoolean("resumed")->"application not resumed"
      !report.getBoolean("attached") || !report.getBoolean("shown")->"source view not visible"
      !report.getBoolean("windowFocused")->"source window not focused"
      !report.getBoolean("viewEnabled")->"source view haptics disabled"
      else->""
    }
    if(reason.isNotEmpty())return report.put("status","suppressed").put("reason",reason).put("mechanism","silent")
    val preset=if(rich=="capture")VibrationEffect.EFFECT_DOUBLE_CLICK else effect(event)
    val auto=route(event,rich,report.getString("richPolicy"),true,report.getBoolean("actuator"),report.getBoolean("envelopeUsable"),report.getBoolean("clickPrimitive"),supported(preset))
    // Unknown Android preference: system API alone owns permission to play.
    var selected=if(report.getInt("systemSetting")==-1)"system" else when(mode){
      "system"->"system"
      "envelope"->if(report.getBoolean("envelopeUsable"))"envelope" else auto
      "primitives"->if(report.getBoolean("clickPrimitive"))"primitives" else auto
      "predefined"->if(supported(preset))"predefined" else auto
      "legacy"->if(report.getBoolean("legacyEnvelopeUsable"))"legacy-envelope" else if(report.getBoolean("tickPrimitive") && report.getBoolean("clickPrimitive"))"legacy-primitives" else "system"
      else->auto
    }
    report.put("fallback",if(mode!="auto" && mode!=selected)"$mode unavailable → $selected" else if(selected=="system" && rich.isNotEmpty())"platform semantic fallback" else "none")
    val attrs=VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_TOUCH).build()
    fun system():Boolean {
      report.put("mechanism","View.performHapticFeedback(${label(event)})").put("androidAccepted",v!!.performHapticFeedback(constant(event)))
      return report.getBoolean("androidAccepted")
    }
    try {
      when(selected){
        "primitives","legacy-primitives"->{
          val legacy=selected.startsWith("legacy")
          val composition=VibrationEffect.startComposition().addPrimitive(if(legacy)VibrationEffect.Composition.PRIMITIVE_TICK else VibrationEffect.Composition.PRIMITIVE_CLICK,if(legacy).35f else if(rich=="capture").65f else 1f)
          if(rich=="capture")composition.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK,if(legacy).45f else 1f,if(legacy)24 else 60)
          vibrator.vibrate(composition.compose(),attrs)
          report.put("mechanism",if(legacy)"legacy TICK .35 + optional CLICK .45 /24ms" else if(rich=="capture")"CLICK .65 →60ms→ CLICK 1.0" else "CLICK 1.0")
        }
        "envelope","legacy-envelope"->{
          val legacy=selected.startsWith("legacy")
          val envelope=VibrationEffect.BasicEnvelopeBuilder().setInitialSharpness(.7f)
            .addControlPoint(if(legacy).25f else .75f,.7f,if(legacy)20 else 40).addControlPoint(0f,.7f,if(legacy)20 else 40)
          if(rich=="capture")envelope.addControlPoint(if(legacy).4f else 1f,.75f,if(legacy)20 else 40).addControlPoint(0f,.75f,if(legacy)20 else 40)
          vibrator.vibrate(envelope.build(),attrs)
          report.put("mechanism",if(legacy)"legacy envelope .25/.4,20ms points" else "envelope .75/1.0,40ms points")
        }
        "predefined"->{vibrator.vibrate(VibrationEffect.createPredefined(preset),attrs);report.put("mechanism","supported predefined effect $preset")}
        else->{if(!system()){
          // Never bypass settings. Use an explicitly supported short preset only.
          val fallback=fallback(event,report.getInt("systemSetting")==1,report.getBoolean("thudPrimitive"),supported(preset))
          if(fallback=="thud"){
            vibrator.vibrate(VibrationEffect.startComposition().addPrimitive(VibrationEffect.Composition.PRIMITIVE_THUD,.9f).compose(),attrs);selected="primitives";report.put("mechanism","supported THUD .9").put("fallback","system declined → distinct deliberate THUD")
          }else if(fallback=="predefined"){
            vibrator.vibrate(VibrationEffect.createPredefined(preset),attrs);selected="predefined";report.put("mechanism","supported predefined effect $preset").put("fallback","system declined → supported preset")
          }else return report.put("status","rejected").put("reason","Android declined system feedback; no supported permitted fallback")
        }}
      }
      return report.put("status","requested").put("route",selected).put("reason","Request submitted; physical sensation requires user verification")
    }catch(_:Exception){
      val accepted=system()
      return report.put("status",if(accepted)"requested" else "rejected").put("route","system").put("fallback","custom request failed → platform").put("reason","Platform fallback; no actuator perceptibility guarantee")
    }
  }
}
