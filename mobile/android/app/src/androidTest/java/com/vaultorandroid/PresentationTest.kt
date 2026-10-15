package com.vaultorandroid

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PresentationTest {
  @Test fun semanticRoutingAndCapabilities() {
    val r = VaultorPresentation.Companion
    for (event in VaultorPresentation.events) {
      assertEquals(VaultorPresentation.Route.SILENT, r.route(event, "capture", false, true, true, true))
      assertEquals(VaultorPresentation.Route.SYSTEM, r.route(event, "", true, true, true, true))
    }
    assertEquals(VaultorPresentation.Route.ENVELOPE, r.route("complete", "capture", true, true, true, true))
    assertEquals(VaultorPresentation.Route.PRIMITIVES, r.route("selection", "anchor", true, true, false, true))
    assertEquals(VaultorPresentation.Route.SYSTEM, r.route("complete", "capture", true, true, false, false))
    assertEquals(VaultorPresentation.Route.SYSTEM, r.route("complete", "capture", true, false, true, true))
    assertEquals(VaultorPresentation.Route.SYSTEM, r.route("micro", "capture", true, true, true, true))
    assertEquals(VaultorPresentation.Route.SILENT, r.route("unknown", "", true, true, true, true))
  }
}
