# Dot-source this script; isolate Android tools from the desktop Java 25 server.
$vaultorAndroidTools = Join-Path $env:LOCALAPPDATA 'VaultorAndroidDev'
$vaultorPhysicalTools = Get-ChildItem (Join-Path $env:LOCALAPPDATA Packages) -Directory -Filter '*Codex*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'LocalCache/Local/VaultorAndroidDev' } | Where-Object { Test-Path (Join-Path $_ 'java/jdk-17.0.20.1+1/bin/java.exe') } | Select-Object -First 1
if ($vaultorPhysicalTools) { $vaultorAndroidTools = $vaultorPhysicalTools }
$env:JAVA_HOME = Join-Path $vaultorAndroidTools 'java\jdk-17.0.20.1+1'
$env:ANDROID_HOME = Join-Path $vaultorAndroidTools 'sdk'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
$env:VAULTOR_ANDROID_KEYSTORE = Join-Path $vaultorAndroidTools 'signing\vaultor-android.p12'
$vaultorAndroidPassword = Join-Path $vaultorAndroidTools 'signing\password.txt'
if (Test-Path -LiteralPath $vaultorAndroidPassword) {
  $env:VAULTOR_ANDROID_KEY_PASSWORD = [IO.File]::ReadAllText($vaultorAndroidPassword)
}
# Do not print signing variables or transfer private files into Git/releases.
