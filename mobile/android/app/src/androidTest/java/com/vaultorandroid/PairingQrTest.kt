package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PairingQrTest {
  private val now = 1_800_000_000L
  private val host = "68947263-c8c4-4b55-81be-c1665fbd7041"
  private val pin = "d".repeat(64)
  private val address = "https://192.168.0.5:8443"

  private fun payload() = JSONObject()
    .put("v", 1).put("address", address).put("hostId", host)
    .put("fingerprint", pin).put("expires", now + 300)

  private fun parse(body: JSONObject) = PairingQr.parse("vaultor-next:" + body, now)

  @Test fun verifiesCurrentEndpointAndIdentityMaterial() {
    assertEquals(PairingQr(address, host, pin), parse(payload()))
  }

  @Test fun refusesMalformedExpiredAndIncompatiblePayloads() {
    listOf(
      payload().put("v", 2),
      payload().put("expires", now - 1),
      payload().put("expires", now + 3600),
      payload().put("address", "http://192.168.0.5:8443"),
      payload().put("address", "https://user@192.168.0.5:8443/?token=hidden"),
      payload().put("hostId", "unknown"),
      payload().put("fingerprint", "a".repeat(63)),
      payload().put("credential", "unexpected"),
    ).forEach { code -> assertThrows(IllegalArgumentException::class.java) { parse(code) } }
    assertThrows(IllegalArgumentException::class.java) { PairingQr.parse("vaultor-next:{", now) }
  }
}
