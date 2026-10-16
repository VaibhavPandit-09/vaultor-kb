package com.vaultorandroid

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Path
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

  enum class Route { SILENT, SYSTEM, ENVELOPE, PRIMITIVES }
  companion object {
    val events = setOf("micro", "selection", "complete", "reject", "destructive")
    fun route(event: String, rich: String, allowed: Boolean, actuator: Boolean, envelope: Boolean, primitives: Boolean): Route {
      if (!allowed || event !in events) return Route.SILENT
      val expressive = (event == "selection" && rich == "anchor") || (event == "complete" && rich == "capture")
      if (!expressive || !actuator) return Route.SYSTEM
      return if (envelope) Route.ENVELOPE else if (primitives) Route.PRIMITIVES else Route.SYSTEM
    }
    fun constant(event: String) = when (event) {
      "micro" -> HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
      "selection" -> HapticFeedbackConstants.SEGMENT_TICK
      "reject" -> HapticFeedbackConstants.REJECT
      else -> HapticFeedbackConstants.CONFIRM
    }
  }
  private fun view(tag: Double): View? = try {
    if (!tag.isFinite() || tag < 1 || tag > Int.MAX_VALUE) null
    else UIManagerHelper.getUIManagerForReactTag(ctx, tag.toInt())?.resolveView(tag.toInt())
  } catch (_: Exception) { null }
  private fun foreground(v: View?) = ctx.lifecycleState == LifecycleState.RESUMED && v != null && v.isAttachedToWindow && v.isShown && v.hasWindowFocus()
  private fun enabled(v: View?) = foreground(v) && v!!.isHapticFeedbackEnabled &&
    Settings.System.getInt(ctx.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 0) == 1 &&
    JSONObject(ctx.getSharedPreferences("reader-presentation-v1", Context.MODE_PRIVATE).getString("preferences", "{}") ?: "{}").optString("haptics", "system") != "off"

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

  @ReactMethod fun feedback(event: String, rich: String, tag: Double, token: String, promise: Promise) {
    main.post {
      try {
        require(event in events && rich in setOf("", "anchor", "capture") && token.length in 1..80)
        val v = view(tag)
        if (!feedbackTokens.add(token)) { promise.resolve("silent"); return@post }
        if (feedbackTokens.size > 64) feedbackTokens.remove(feedbackTokens.first())
        if (!enabled(v)) { promise.resolve("silent"); return@post }
        val route = route(event, rich, true, vibrator.hasVibrator(), vibrator.areEnvelopeEffectsSupported(),
          vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK, VibrationEffect.Composition.PRIMITIVE_CLICK))
        var actual = route
        try {
          when (route) {
            Route.ENVELOPE -> {
              val effect = VibrationEffect.BasicEnvelopeBuilder().setInitialSharpness(0.65f)
                .addControlPoint(0.25f, 0.65f, 20).addControlPoint(0f, 0.65f, 20)
              if (rich == "capture") effect.addControlPoint(0.4f, 0.7f, 20).addControlPoint(0f, 0.7f, 20)
              vibrator.vibrate(effect.build(), VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_TOUCH).build())
            }
            Route.PRIMITIVES -> {
              val effect = VibrationEffect.startComposition().addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.35f)
              if (rich == "capture") effect.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.45f, 24)
              vibrator.vibrate(effect.compose(), VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_TOUCH).build())
            }
            Route.SYSTEM -> v!!.performHapticFeedback(constant(event))
            Route.SILENT -> {}
          }
        } catch (_: Exception) {
          actual = Route.SYSTEM
          v!!.performHapticFeedback(constant(event))
        }
        promise.resolve(actual.name.lowercase())
      } catch (_: Exception) { promise.resolve("silent") }
    }
  }

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
    val maxRadius = hypot(max(centerX, root.width - centerX), max(centerY, root.height - centerY))
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO; layout(0, 0, root.width, root.height) }
    override fun onDraw(canvas: Canvas) {
      val saved = canvas.save()
      hole.reset(); hole.addCircle(centerX, centerY, radius, Path.Direction.CW)
      canvas.clipOutPath(hole)
      canvas.drawBitmap(bitmap, 0f, 0f, null)
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
      if (roots.any { it.width <= 0 || it.height <= 0 } || roots.sumOf { it.width.toLong() * it.height * 4 } > 32L * 1024 * 1024) {
        promise.resolve(false); return@post
      }
      val at = IntArray(2); origin.getLocationOnScreen(at)
      for (root in roots) {
        val location = IntArray(2); root.getLocationOnScreen(location)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        try {
          val canvas = Canvas(bitmap)
          // Transparent modal scrims must be composited once, not darkened a
          // second time over their live counterparts by a translucent snapshot.
          overlays.firstOrNull()?.let { base ->
            val baseAt = IntArray(2); base.root.getLocationOnScreen(baseAt)
            canvas.drawBitmap(base.bitmap, (baseAt[0] - location[0]).toFloat(), (baseAt[1] - location[1]).toFloat(), null)
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
      interpolator = PathInterpolator(0.2f, 0f, 0f, 1f)
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
  override fun onHostPause() { main.post { finishFocus?.invoke(false); clearTheme(); vibrator.cancel() } }
  override fun onHostDestroy() { main.post { finishFocus?.invoke(false); clearTheme(); vibrator.cancel() } }
  override fun invalidate() { ctx.removeLifecycleEventListener(this); main.post { finishFocus?.invoke(false); clearTheme() }; super.invalidate() }
}
