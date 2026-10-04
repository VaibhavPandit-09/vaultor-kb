param([string]$Installer = "$PSScriptRoot\..\releases\Vaultor-0.2.1-windows-x64.exe", [string]$PriorInstaller = "", [switch]$SkipNative, [switch]$PreserveShortcuts)
$ErrorActionPreference = 'Stop'
$existing = Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall | Get-ItemProperty | Where-Object DisplayName -EQ 'Vaultor'
if ($existing) { throw 'An installed Vaultor already exists. Use a disposable Windows account for this check.' }
$existingLinks = @(@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | ForEach-Object { Join-Path $_ 'Vaultor.lnk' } | Where-Object { Test-Path -LiteralPath $_ })
if ($existingLinks.Count -and -not $PreserveShortcuts) { throw 'An existing Vaultor shortcut must not be overwritten by this check. Use PreserveShortcuts to back up and restore its exact bytes.' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('vaultor-installer-' + [Guid]::NewGuid())
$appPath = Join-Path $testRoot 'app'
$sentinel = Join-Path $testRoot 'data\retained.txt'
New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
Set-Content -LiteralPath $sentinel -Value 'Disposable storage must survive uninstall'
$savedLinks = @($existingLinks | ForEach-Object {
    $backup = Join-Path $testRoot ([Guid]::NewGuid().ToString() + '.lnk')
    Copy-Item -LiteralPath $_ -Destination $backup
    [PSCustomObject]@{Original=$_;Backup=$backup}
})
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
function Install-Checked([string]$Source = $installerPath) {
    $process = Start-Process -FilePath $Source -ArgumentList @('/S', "/D=$appPath") -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    foreach ($file in @('Vaultor.exe', 'resources\bundle\manifest.json', 'resources\app\release-trust.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $appPath $file))) { throw "Missing installed file: $file" }
    }
    $manifest = Get-Content -LiteralPath ($Source + '.vaultor.json') -Raw | ConvertFrom-Json
    $installed = Get-Content -LiteralPath (Join-Path $appPath 'resources\app\package.json') -Raw | ConvertFrom-Json
    if ($installed.version -ne $manifest.manifest.appVersion) { throw 'Installed version does not match the built release' }
}
function Uninstall-Checked {
    $uninstaller = Join-Path $appPath 'Uninstall Vaultor.exe'
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Uninstaller failed: $($process.ExitCode)" }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Test-Path -LiteralPath (Join-Path $appPath 'Vaultor.exe')) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (Test-Path -LiteralPath (Join-Path $appPath 'Vaultor.exe')) { throw 'Uninstall did not remove the executable' }
    if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Uninstall removed separate data' }
}
try {
    if ($PriorInstaller) { Install-Checked (Resolve-Path -LiteralPath $PriorInstaller).Path }
    Install-Checked
    if (-not $SkipNative) {
        & node "$PSScriptRoot\chrome-smoke.mjs" (Join-Path $appPath 'Vaultor.exe')
        if ($LASTEXITCODE -ne 0) { throw 'Installed native app check failed' }
    }
    Install-Checked # Same-version repair, not a claim of a different-version upgrade.
    Uninstall-Checked
    Install-Checked
    Write-Output "Installer/upgrade-if-supplied/repair/uninstall/reinstall passed. Disposable files: $testRoot"
} finally {
    try { if (Test-Path -LiteralPath (Join-Path $appPath 'Uninstall Vaultor.exe')) { Uninstall-Checked } }
    finally { foreach ($link in $savedLinks) { Copy-Item -LiteralPath $link.Backup -Destination $link.Original -Force } }
}
