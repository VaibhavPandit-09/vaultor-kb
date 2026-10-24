param([Parameter(Mandatory=$true)][string]$Root, [ValidateSet('race','locked')][string]$Mode)
$ErrorActionPreference = 'Stop'
# Phase 3: disposable Windows API experiment, not installed-app native code.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VaultorReplaceProof {
  [DllImport("kernel32.dll", EntryPoint="ReplaceFileW", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool Replace(string target, string replacement, string backup, uint flags, IntPtr exclude, IntPtr reserved);
}
'@
$proofTarget = Join-Path $Root 'doc.md'
$proofStage = Join-Path $Root 'native-stage.md'
$proofBackup = Join-Path $Root 'native-backup.md'
$proofStream = [System.IO.File]::Open($proofStage,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try {
  $proofBytes = [System.Text.Encoding]::UTF8.GetBytes("Native local`n")
  $proofStream.Write($proofBytes,0,$proofBytes.Length)
  $proofStream.Flush($true)
} finally { $proofStream.Dispose() }
$proofHeld = $null
try {
  if ($Mode -eq 'race') { [System.IO.File]::WriteAllText($proofTarget,"Intervening native disk`n",[System.Text.UTF8Encoding]::new($false)) }
  if ($Mode -eq 'locked') { $proofHeld = [System.IO.File]::Open($proofTarget,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read) }
  $proofSuccess = [VaultorReplaceProof]::Replace($proofTarget,$proofStage,$proofBackup,0,[IntPtr]::Zero,[IntPtr]::Zero)
  $proofError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
} finally { if ($proofHeld) { $proofHeld.Dispose() } }
[Console]::WriteLine('{"success":' + $proofSuccess.ToString().ToLowerInvariant() + ',"error":' + $proofError + ',"backupExists":' + [System.IO.File]::Exists($proofBackup).ToString().ToLowerInvariant() + '}')
