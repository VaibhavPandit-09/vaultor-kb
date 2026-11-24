param([string]$Helper = (Join-Path (Split-Path $PSScriptRoot) 'src-tauri/target/release/vaultor-legacy-replacement.exe'))
$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::LoadFile($Helper)
$clean = $assembly.GetType('LegacyReplacement').GetMethod('CleanTree', [Reflection.BindingFlags]'Static,NonPublic')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('vaultor-replacement-' + [guid]::NewGuid().ToString('N'))
$legacy = Join-Path $fixture 'legacy'
$external = Join-Path $fixture 'external'
New-Item -ItemType Directory -Path $legacy,$external | Out-Null
Set-Content -LiteralPath (Join-Path $external 'original.md') -Value 'untouched external source'
Set-Content -LiteralPath (Join-Path $legacy 'owned.bin') -Value 'verified old payload'
Set-Content -LiteralPath (Join-Path $legacy 'locked.bin') -Value 'locked payload'
Set-Content -LiteralPath (Join-Path $legacy 'unexpected.txt') -Value 'unowned'
New-Item -ItemType Junction -Path (Join-Path $legacy 'junction') -Target $external | Out-Null
$owned = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($name in 'owned.bin','locked.bin') { $owned[$name] = (Get-FileHash -LiteralPath (Join-Path $legacy $name)).Hash }
$residual = [Collections.Generic.List[string]]::new()
$expectedExternal = (Get-FileHash -LiteralPath (Join-Path $external 'original.md')).Hash
$lock = [IO.File]::Open((Join-Path $legacy 'locked.bin'), 'Open', 'Read', 'Read')
try {
    $clean.Invoke($null, [object[]]@($legacy.PSObject.BaseObject, [string]::Empty, $owned.PSObject.BaseObject, $residual.PSObject.BaseObject, $null))
} finally { $lock.Dispose() }
if (Test-Path -LiteralPath (Join-Path $legacy 'owned.bin')) { throw 'Owned payload was not removed' }
foreach ($name in 'locked.bin','unexpected.txt','junction') {
    if (!(Test-Path -LiteralPath (Join-Path $legacy $name))) { throw "Unexpected removal: $name" }
}
if ((Get-FileHash -LiteralPath (Join-Path $external 'original.md')).Hash -ne $expectedExternal) { throw 'External source changed' }
if ($residual.Count -ne 3) { throw "Unexpected residual count $($residual.Count): $residual" }
'Owned payload deleted. Locked, unexpected and junction entries retained. External bytes unchanged.'

$unexpectedFolder = Join-Path $legacy 'appearance.json'
New-Item -ItemType Directory -Path $unexpectedFolder | Out-Null
Set-Content -LiteralPath (Join-Path $unexpectedFolder 'user-owned.md') -Value 'Keep this file'
$residual.Clear()
$clean.Invoke($null, [object[]]@($unexpectedFolder.PSObject.BaseObject, 'appearance.json', $null, $residual.PSObject.BaseObject, $false))
if (!(Test-Path -LiteralPath (Join-Path $unexpectedFolder 'user-owned.md')) -or $residual.Count -ne 1) {
    throw 'A directory with an allowlisted file name must be retained and reported'
}
'Directory with an allowlisted file name retained and reported.'

$roaming = Join-Path $fixture 'roaming'
$orphan = Join-Path $roaming 'Vaultor'
New-Item -ItemType Directory -Path $orphan -Force | Out-Null
Set-Content -LiteralPath (Join-Path $orphan 'original.txt') -Value 'Unknown owner'
$receipt = Join-Path $fixture 'orphan-receipt.txt'
$writer = [IO.StreamWriter]::new($receipt)
$finalize = $assembly.GetType('LegacyReplacement').GetMethod('FinalizeReplacement', [Reflection.BindingFlags]'Static,NonPublic')
try {
    $finalize.Invoke($null, [object[]]@($legacy.PSObject.BaseObject, $roaming.PSObject.BaseObject, $null, $receipt.PSObject.BaseObject, $writer.PSObject.BaseObject))
    throw 'An unverified profile must be reported'
} catch [System.Management.Automation.MethodInvocationException] {
    if ($_.Exception.GetBaseException().Message -notmatch 'Legacy residuals were retained') { throw }
} finally {
    $writer.Dispose()
}
if (!(Test-Path -LiteralPath (Join-Path $orphan 'original.txt'))) { throw 'Unverified original was removed' }
if ((Get-Content -LiteralPath $receipt -Raw) -notmatch [regex]::Escape($orphan)) { throw 'Missing residual path' }
'Unverified legacy profile retained and reported.'
