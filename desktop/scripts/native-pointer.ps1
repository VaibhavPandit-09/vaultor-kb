param([string]$Handle, [int]$X, [int]$Y, [switch]$Escape, [switch]$MenuSelect)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class VaultorPointer {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref Point p);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
}
'@
[VaultorPointer]::SetProcessDPIAware() | Out-Null
$target = [IntPtr]::new([long]::Parse($Handle))
[VaultorPointer]::SetForegroundWindow($target) | Out-Null
if ($Escape -or $MenuSelect) {
 foreach ($key in $(if($MenuSelect){40,13}else{27})) {
  [VaultorPointer]::keybd_event($key,0,0,[UIntPtr]::Zero)
  [VaultorPointer]::keybd_event($key,0,2,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 150
 }
} else {
 $scale = [VaultorPointer]::GetDpiForWindow($target) / 96.0
 $point = New-Object VaultorPointer+Point
 $point.X = [int]($X * $scale); $point.Y = [int]($Y * $scale)
 [VaultorPointer]::ClientToScreen($target,[ref]$point) | Out-Null
 [VaultorPointer]::SetCursorPos($point.X,$point.Y) | Out-Null
 Start-Sleep -Milliseconds 100
 [VaultorPointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [VaultorPointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
