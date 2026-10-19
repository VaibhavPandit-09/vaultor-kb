package com.vaultorandroid

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Path
import android.graphics.Paint
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsetsController
import android.view.ViewTreeObserver
import android.view.animation.PathInterpolator
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.textinput.ReactEditText
import org.json.JSONObject
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sqrt

/** Device presentation only. No workspace, credentials or network access. */
class VaultorPresentation(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx), LifecycleEventListener {
  override fun getName() = "VaultorPresentation"
  private val main = Handler(Looper.getMainLooper())
  private val vibrator = ctx.getSystemService(VibratorManager::class.java).defaultVibrator
  private val feedbackTokens = linkedSetOf<String>()
  private var themeToken = ""
  private var animator: ValueAnimator? = null
  private val overlays = mutableListOf<Reveal>()
  private val timeout = Runnable { clearTheme() }
  private var focusToken = ""
  private var finishFocus: ((Boolean) -> Unit)? = null
  init { ctx.addLifecycleEventListener(this) }

  private val haptics = VaultorHaptics(ctx, vibrator)
  private val captureFeedbackTrace = CaptureFeedbackTrace(BuildConfig.VAULTOR_DIAGNOSTICS)
  private var lastFeedback = JSONObject()
  override fun getConstants():Map<String,Any> = mapOf("developmentDiagnostics" to BuildConfig.VAULTOR_DIAGNOSTICS)
  private fun view(tag: Double): View? = try {
    if (!tag.isFinite() || tag < 1 || tag > Int.MAX_VALUE) null
    else UIManagerHelper.getUIManagerForReactTag(ctx, tag.toInt())?.resolveView(tag.toInt())
  } catch (_: Exception) { null }
  private fun foreground(v: View?) = ctx.lifecycleState == LifecycleState.RESUMED && v != null && v.isAttachedToWindow && v.isShown && v.hasWindowFocus()
  // Reader input stays on the activity window. A closing modal must release
  // window ownership before RN's native EditText requests the IME.
  @ReactMethod fun focusInput(tag: Double, token: String, promise: Promise) { main.post {
    finishFocus?.invoke(false)
    val decor = ctx.currentActivity?.window?.decorView
    if (decor == null || ctx.lifecycleState != LifecycleState.RESUMED || token.length !in 1..80) {
      promise.resolve(false); return@post
    }
    focusToken = token
    val observer = decor.viewTreeObserver
    var windowListener: ViewTreeObserver.OnWindowFocusChangeListener? = null
    var layoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null
    val expiry = Runnable { if (focusToken == token) finishFocus?.invoke(false) }
    val finish: (Boolean) -> Unit = { focused ->
      if (focusToken == token) {
        focusToken = ""; finishFocus = null; main.removeCallbacks(expiry)
        if (observer.isAlive) {
          windowListener?.let { observer.removeOnWindowFocusChangeListener(it) }
          layoutListener?.let { observer.removeOnGlobalLayoutListener(it) }
        }
        promise.resolve(focused)
      }
    }
    finishFocus = finish
    val attempt = {
      val input = view(tag) as? ReactEditText
      if (input != null && input.rootView === decor && foreground(input) && input.width > 0 && input.height > 0) {
        input.requestFocusFromJS(); finish(input.hasFocus())
      }
    }
    windowListener = ViewTreeObserver.OnWindowFocusChangeListener { if (it) attempt() }
    layoutListener = ViewTreeObserver.OnGlobalLayoutListener { attempt() }
    observer.addOnWindowFocusChangeListener(windowListener)
    observer.addOnGlobalLayoutListener(layoutListener)
    main.postDelayed(expiry, 250); attempt()
  } }
  @ReactMethod fun cancelInputFocus(token: String) { main.post { if (focusToken == token) finishFocus?.invoke(false) } }

  /** Source sheet must release its window before activity feedback/settle. */
  @ReactMethod fun awaitWindow(tag:Double,promise:Promise) { main.post {
    val v=view(tag)
    if(v==null || ctx.lifecycleState!=LifecycleState.RESUMED){promise.resolve(false);return@post}
    if(foreground(v)){promise.resolve(true);return@post}
    val observer=v.viewTreeObserver
    var finished=false
    var listener:ViewTreeObserver.OnWindowFocusChangeListener?=null
    var expiry:Runnable?=null
    val finish:(Boolean)->Unit={accepted->if(!finished){finished=true;listener?.let{if(observer.isAlive)observer.removeOnWindowFocusChangeListener(it)};expiry?.let{main.removeCallbacks(it)};promise.resolve(accepted)}}
    listener=ViewTreeObserver.OnWindowFocusChangeListener{if(it)finish(foreground(v))}
    observer.addOnWindowFocusChangeListener(listener)
    expiry=Runnable{finish(false)};main.postDelayed(expiry,400)
  } }

  @ReactMethod fun captureTrace(action:String,promise:Promise) { main.post {
    if(!BuildConfig.VAULTOR_DIAGNOSTICS){promise.reject("DEVELOPMENT_ONLY","Diagnostics absent from ordinary production builds.");return@post}
    when(action) {
      "arm"->promise.resolve(captureFeedbackTrace.arm())
      "read"->promise.resolve(captureFeedbackTrace.snapshot())
      "clear"->promise.resolve(captureFeedbackTrace.clear())
      "copy"->{
        val value=captureFeedbackTrace.seal()
        (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager)
          .setPrimaryClip(android.content.ClipData.newPlainText("Vaultor capture feedback trace",value))
        promise.resolve(value)
      }
      else->promise.reject("TRACE_ACTION","Unknown trace action.")
    }
  } }
  @ReactMethod fun captureTraceRecord(id:String,stage:String,facts:String,jsMs:Double,promise:Promise) { main.post {
    if(!BuildConfig.VAULTOR_DIAGNOSTICS){promise.reject("DEVELOPMENT_ONLY","Diagnostics absent from ordinary production builds.");return@post}
    try { if(facts.length<=1024)captureFeedbackTrace.record(id,stage,JSONObject(facts),jsMs);promise.resolve(null) }
    catch(_:Exception){promise.resolve(null)}
  } }
  @ReactMethod fun feedback(event:String,rich:String,tag:Double,token:String,promise:Promise) =
    feedbackRequest(event,rich,tag,token,"",promise)
  @ReactMethod fun feedbackTraced(event:String,rich:String,tag:Double,token:String,traceId:String,promise:Promise) {
    if(!BuildConfig.VAULTOR_DIAGNOSTICS){promise.reject("DEVELOPMENT_ONLY","Diagnostics absent from ordinary production builds.");return}
    feedbackRequest(event,rich,tag,token,traceId,promise)
  }
  private fun feedbackRequest(event:String,rich:String,tag:Double,token:String,traceId:String,promise:Promise) { main.post {
    fun trace(stage:String,facts:JSONObject) {
      try { captureFeedbackTrace.record(traceId,stage,facts) } catch(_:Exception) { /* Never change playback for diagnostics. */ }
    }
    val facts=JSONObject().put("event",event).put("pattern",rich)
    trace("bridge_received",facts)
    try {
      if(token.length !in 1..80){trace("bridge_rejected",facts.put("reason","invalid_token"));promise.resolve("silent");return@post}
      if(!VaultorHaptics.validProductEvent(event,rich)){trace("bridge_rejected",facts.put("reason","invalid_event"));promise.resolve("silent");return@post}
      if(!feedbackTokens.add(token)){trace("bridge_rejected",facts.put("reason","duplicate_token"));promise.resolve("silent");return@post}
      if(feedbackTokens.size>64)feedbackTokens.remove(feedbackTokens.first())
      lastFeedback=haptics.play(event,rich,view(tag),observe=if(BuildConfig.VAULTOR_DIAGNOSTICS && traceId.isNotEmpty())::trace else null)
      trace("native_result",lastFeedback)
      promise.resolve(if(lastFeedback.optString("status")=="requested")lastFeedback.optString("route","system") else "silent")
    }catch(_:Exception){trace("bridge_rejected",facts.put("reason","bridge_exception"));promise.resolve("silent")}
  } }
  @ReactMethod fun hapticDiagnostics(event:String,rich:String,mode:String,tag:Double,promise:Promise) { main.post {
    if(!BuildConfig.VAULTOR_DIAGNOSTICS){promise.reject("DEVELOPMENT_ONLY","Diagnostics absent from ordinary production builds.");return@post}
    if(mode!="inspect" && captureFeedbackTrace.measuring){promise.reject("TRACE_ACTIVE","Manual playback disabled while real capture trace is armed; copy or clear trace first.");return@post}
    try {
      require(mode in setOf("inspect","auto","system","envelope","primitives","predefined","legacy"))
      val report=if(mode=="inspect")haptics.describe(event,rich,view(tag)).put("lastFeedback",lastFeedback) else haptics.play(event,rich,view(tag),mode)
      promise.resolve(report.toString())
    }catch(_:Exception){promise.reject("DIAGNOSTIC","Device capability inspection failed.")}
  } }

  @ReactMethod fun systemBars(light: Boolean, tag: Double) { main.post {
    val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
    listOfNotNull(ctx.currentActivity?.window?.decorView, view(tag)?.rootView).distinct().forEach {
      it.windowInsetsController?.setSystemBarsAppearance(if (light) flags else 0, flags)
    }
  } }

  /** Old pixels are transient in-memory overlays, never files or accessible
   * duplicate controls. Actual reader/views stay mounted and interactive. */
  private class Reveal(val root: ViewGroup, val bitmap: Bitmap, val centerX: Float, val centerY: Float) : View(root.context) {
    var radius = 0f
    private val hole = Path()
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    val maxRadius = hypot(max(centerX, root.width - centerX), max(centerY, root.height - centerY))
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO; layout(0, 0, root.width, root.height) }
    override fun onDraw(canvas: Canvas) {
      val saved = canvas.save()
      hole.reset(); hole.addCircle(centerX, centerY, radius, Path.Direction.CW)
      canvas.clipOutPath(hole)
      canvas.drawBitmap(bitmap, null, RectF(0f, 0f, width.toFloat(), height.toFloat()), paint)
      canvas.restoreToCount(saved)
    }
  }
  private fun clearTheme() {
    main.removeCallbacks(timeout)
    val old = animator; animator = null
    old?.removeAllListeners(); old?.cancel()
    overlays.forEach { it.root.overlay.remove(it) }
    overlays.clear(); themeToken = ""
  }
  @ReactMethod fun cancelTheme() { main.post { clearTheme() } }
  @ReactMethod fun prepareTheme(tag: Double, token: String, promise: Promise) { main.post {
    clearTheme()
    try {
      val origin = view(tag)
      if (!foreground(origin) || !ValueAnimator.areAnimatorsEnabled() || token.length !in 1..80) { promise.resolve(false); return@post }
      val roots = listOfNotNull(ctx.currentActivity?.window?.decorView, origin!!.rootView).distinct().filterIsInstance<ViewGroup>()
      // Fail open on large windows instead of allocating unbounded snapshots.
      if (roots.any { it.width <= 0 || it.height <= 0 }) {
        promise.resolve(false); return@post
      }
      val total = roots.sumOf { it.width.toLong() * it.height * 4 }
      val scale = minOf(1.0, sqrt(32.0 * 1024 * 1024 / total)).toFloat()
      val at = IntArray(2); origin.getLocationOnScreen(at)
      for (root in roots) {
        val location = IntArray(2); root.getLocationOnScreen(location)
        val bitmap = Bitmap.createBitmap(max(1,(root.width * scale).toInt()), max(1,(root.height * scale).toInt()), Bitmap.Config.ARGB_8888)
        try {
          val canvas = Canvas(bitmap)
          canvas.scale(scale, scale)
          // Transparent modal scrims must be composited once, not darkened a
          // second time over their live counterparts by a translucent snapshot.
          overlays.firstOrNull()?.let { base ->
            val baseAt = IntArray(2); base.root.getLocationOnScreen(baseAt)
            val x=(baseAt[0]-location[0]).toFloat(); val y=(baseAt[1]-location[1]).toFloat()
            canvas.drawBitmap(base.bitmap,null,RectF(x,y,x+base.root.width,y+base.root.height),Paint(Paint.FILTER_BITMAP_FLAG))
          }
          root.draw(canvas)
        } catch (e: Exception) { bitmap.recycle(); throw e }
        val overlay = Reveal(root, bitmap, at[0] - location[0] + origin.width / 2f, at[1] - location[1] + origin.height / 2f)
        overlays.add(overlay); root.overlay.add(overlay)
      }
      themeToken = token
      main.postDelayed(timeout, 700)
      promise.resolve(true)
    } catch (_: Exception) { clearTheme(); promise.resolve(false) }
      catch (_: OutOfMemoryError) { clearTheme(); promise.resolve(false) }
  } }
  @ReactMethod fun revealTheme(token: String, duration: Double, promise: Promise) { main.post {
    if (token != themeToken) { promise.resolve(null); return@post }
    if (!duration.isFinite() || duration <= 0 || ctx.lifecycleState != LifecycleState.RESUMED) {
      clearTheme(); promise.resolve(null); return@post
    }
    main.removeCallbacks(timeout)
    val endRadius = overlays.maxOfOrNull { it.maxRadius } ?: 0f
    animator = ValueAnimator.ofFloat(0f, 1f).apply {
      this.duration = duration.toLong().coerceIn(1, 500)
      interpolator = PathInterpolator(0.2f, 0f, 0.2f, 1f)
      addUpdateListener { value ->
        if (overlays.any { it.root.width != it.width || it.root.height != it.height || !it.root.isAttachedToWindow }) clearTheme()
        else overlays.forEach { it.radius = endRadius * (value.animatedValue as Float); it.invalidate() }
      }
      addListener(object : AnimatorListenerAdapter() { override fun onAnimationEnd(animation: Animator) { clearTheme() } })
      start()
    }
    main.postDelayed(timeout, 650)
    promise.resolve(null)
  } }
  override fun onHostResume() {}
  override fun onHostPause() { main.post { captureFeedbackTrace.lifecycle("host_paused");finishFocus?.invoke(false); clearTheme(); vibrator.cancel() } }
  override fun onHostDestroy() { main.post { captureFeedbackTrace.lifecycle("host_destroyed");finishFocus?.invoke(false); clearTheme(); vibrator.cancel() } }
  override fun invalidate() { ctx.removeLifecycleEventListener(this); main.post { finishFocus?.invoke(false); clearTheme() }; super.invalidate() }
}
