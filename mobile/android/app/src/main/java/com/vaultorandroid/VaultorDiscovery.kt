package com.vaultorandroid
import android.content.Context
import android.net.nsd.*
import android.os.Handler
import android.os.Looper
import org.json.*
import java.net.Inet4Address

/** Bounded foreground candidates; DNS-SD never supplies approval or trust. */
class VaultorDiscovery(private val ctx:Context,private val changed:()->Unit){
 private val nsd=ctx.getSystemService(NsdManager::class.java);private val handler=Handler(Looper.getMainLooper());private val items=linkedMapOf<String,JSONObject>();private val pending=java.util.ArrayDeque<NsdServiceInfo>();private var resolving=false;private var listener:NsdManager.DiscoveryListener?=null;private var ticket=0;private var error=""
 companion object {fun privateAddress(address:String):Boolean {val p=address.split('.').mapNotNull {it.toIntOrNull()};return p.size==4&&p.all{it in 0..255}&&(p[0]==10||p[0]==127||p[0]==192&&p[1]==168||p[0]==172&&p[1] in 16..31)}}
 @Synchronized fun snapshot()=JSONObject().put("scanning",listener!=null).put("items",JSONArray(items.values.toList())).put("error",error)
 @Synchronized fun stop(){ticket++;val old=listener;listener=null;pending.clear();resolving=false;try{if(old!=null)nsd.stopServiceDiscovery(old)}catch(_:Exception){};changed()}
 @Synchronized fun start():JSONObject {stop();if(android.os.Build.VERSION.SDK_INT>=37&&ctx.checkSelfPermission(android.Manifest.permission.ACCESS_LOCAL_NETWORK)!=android.content.pm.PackageManager.PERMISSION_GRANTED){error="Local network permission required. Manual addresses remain available.";return snapshot()};items.clear();error="";val scan=ticket
  val l=object:NsdManager.DiscoveryListener{
   override fun onDiscoveryStarted(type:String){changed()}
   override fun onDiscoveryStopped(type:String){synchronized(this@VaultorDiscovery){if(scan==ticket){listener=null;changed()}}}
   override fun onStartDiscoveryFailed(type:String,code:Int){synchronized(this@VaultorDiscovery){if(scan==ticket){error="Nearby discovery unavailable. Use a manual address.";stop()}}}
   override fun onStopDiscoveryFailed(type:String,code:Int){changed()}
   override fun onServiceLost(service:NsdServiceInfo){synchronized(this@VaultorDiscovery){if(scan==ticket){items.entries.removeAll {it.value.optString("service")==service.serviceName};changed()}}}
   override fun onServiceFound(service:NsdServiceInfo){synchronized(this@VaultorDiscovery){if(scan!=ticket||pending.size>=32||items.size>=64)return;pending.add(service);resolve(scan)}}
  };listener=l;try{nsd.discoverServices("_vaultor._tcp.",NsdManager.PROTOCOL_DNS_SD,l);handler.postDelayed({synchronized(this){if(scan==ticket)stop()}},10000)}catch(_:Exception){error="Discovery permission or network unavailable; use a manual address.";stop()};return snapshot()
 }
 @Synchronized private fun resolve(scan:Int){if(resolving||pending.isEmpty()||scan!=ticket)return;resolving=true;val service=pending.removeFirst();try{nsd.resolveService(service,object:NsdManager.ResolveListener{override fun onResolveFailed(info:NsdServiceInfo,code:Int){done(null)};override fun onServiceResolved(info:NsdServiceInfo){done(info)};private fun done(info:NsdServiceInfo?){synchronized(this@VaultorDiscovery){if(scan!=ticket)return;resolving=false;if(info!=null){val attrs=info.attributes;val id=attrs["hostId"]?.toString(Charsets.UTF_8).orEmpty();val protocol=attrs["protocol"]?.toString(Charsets.UTF_8);if(id.matches(Regex("[\\w-]{1,80}"))&&protocol=="1"&&info.port in 1..65535){for(address in info.hostAddresses.filterIsInstance<Inet4Address>().take(8)){val ip=address.hostAddress?:continue;if(privateAddress(ip)&&items.size<64)items["$id:$ip"]=JSONObject().put("hostId",id).put("name",info.serviceName.take(100)).put("service",info.serviceName).put("address","https://$ip:"+info.port)}}};changed();resolve(scan)}}})}catch(_:Exception){resolving=false;error="Some discovery candidates could not be resolved. Manual address is available.";resolve(scan)}}
}
