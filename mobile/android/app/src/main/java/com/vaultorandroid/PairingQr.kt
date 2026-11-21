package com.vaultorandroid

import org.json.JSONObject
import java.net.URI
import java.util.UUID

/** An out-of-band pin and endpoint hint. Normal TLS and matching-code enrollment still apply. */
internal data class PairingQr(val address: String, val hostId: String, val fingerprint: String) {
  companion object {
    fun parse(input: String, now: Long = System.currentTimeMillis() / 1000): PairingQr {
      val prefix = "vaultor-next:"
      require(input.length <= 512 && input.startsWith(prefix)) { "This is not a Vaultor Next pairing QR." }
      val code = runCatching { JSONObject(input.removePrefix(prefix)) }
        .getOrElse { throw IllegalArgumentException("This pairing QR is malformed.") }
      require(code.opt("v") == 1) { "This pairing QR version is unsupported." }
      val expiry = code.opt("expires")
      require((expiry is Int || expiry is Long) && (expiry as Number).toLong() in now..(now + 330)) {
        "This pairing QR expired. Show a new code on Windows."
      }
      val host = code.optString("hostId")
      val fingerprint = code.optString("fingerprint")
      val address = code.optString("address")
      val uri = runCatching { URI(address) }.getOrNull()
      require(code.length() == 5 && runCatching { UUID.fromString(host).toString() == host }.getOrDefault(false) &&
        fingerprint.matches(Regex("[a-f0-9]{64}")) && address.length in 1..100 &&
        uri?.scheme == "https" && uri.host != null && uri.port in 1..65535 &&
        uri.rawUserInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null) {
        "This pairing QR is malformed."
      }
      return PairingQr(address, host, fingerprint)
    }
  }
}
