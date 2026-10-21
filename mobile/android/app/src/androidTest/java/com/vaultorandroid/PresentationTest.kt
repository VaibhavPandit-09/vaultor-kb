package com.vaultorandroid
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PresentationTest {
  @Test fun semanticRoutingAndCapabilities() {
    val h=VaultorHaptics.Companion
    for(event in h.events){
      assertEquals("silent",h.route(event,"capture","clear",false,true,true,true,true))
      assertEquals("system",h.route(event,"","clear",true,true,true,true,true))
    }
    assertTrue(h.validProductEvent("selection",""))
    assertTrue(h.validProductEvent("complete",h.REVIEW_CAPTURED))
    assertFalse(h.validProductEvent("selection",h.REVIEW_CAPTURED))
    assertFalse(h.validProductEvent("complete","capture"))
    assertFalse(h.validProductEvent("selection","anchor"))
    assertFalse(h.validProductEvent("unknown",""))
    assertEquals("system",h.route("selection","","clear",true,true,true,true,true))
    assertEquals("primitives",h.route("complete",h.REVIEW_CAPTURED,"clear",true,true,false,true,true))
    assertEquals("system",h.route("complete",h.REVIEW_CAPTURED,"clear",true,true,false,false,false))
    assertEquals("primitives",h.route("selection","anchor","clear",true,true,true,true,true))
    assertEquals("envelope",h.route("complete","capture","expressive",true,true,true,true,true))
    assertEquals("primitives",h.route("complete","capture","expressive",true,true,false,true,true))
    assertEquals("predefined",h.route("complete","capture","clear",true,true,false,false,true))
    assertEquals("system",h.route("complete","capture","clear",true,true,false,false,false))
    assertEquals("system",h.route("complete","capture","platform",true,true,true,true,true))
    assertEquals("system",h.route("complete","capture","clear",true,false,true,true,true))
    assertEquals("silent",h.route("unknown","","clear",true,true,true,true,true))
    assertEquals(5,h.events.map{h.constant(it)}.toSet().size)
    assertEquals("thud",h.fallback("destructive",true,true,true))
    assertEquals("silent",h.fallback("destructive",true,false,true))
    assertEquals("predefined",h.fallback("complete",true,true,true))
    assertEquals("silent",h.fallback("reject",false,true,true))
    assertEquals("silent",h.fallback("selection",true,false,false))
  }
}
