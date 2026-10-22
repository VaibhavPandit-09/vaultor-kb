package com.vaultorandroid

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private var acquisitionId=java.util.UUID.randomUUID().toString()
  override fun onCreate(savedInstanceState:android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    acquisitionId=savedInstanceState?.getString("vaultorAcquisitionId") ?: java.util.UUID.randomUUID().toString()
    collectIntent(intent)
  }
  override fun onSaveInstanceState(outState:android.os.Bundle){outState.putString("vaultorAcquisitionId",acquisitionId);super.onSaveInstanceState(outState)}
  private fun collectIntent(intent:android.content.Intent){if(intent.action in listOf(android.content.Intent.ACTION_SEND,android.content.Intent.ACTION_SEND_MULTIPLE))try{VaultorImports.get(applicationContext).receive(intent,acquisitionId)}catch(_:Exception){android.widget.Toast.makeText(this,"Import storage unavailable. Retained originals are untouched; open Pending imports for recovery.",android.widget.Toast.LENGTH_LONG).show()}}
  override fun onNewIntent(intent:android.content.Intent){super.onNewIntent(intent);acquisitionId=java.util.UUID.randomUUID().toString();setIntent(intent);collectIntent(intent)}

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "VaultorAndroid"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
