param([switch]$Diagnostics, [switch]$NextCandidate)
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path $PSScriptRoot
& npm.cmd --prefix $mobileRoot run check
if ($LASTEXITCODE -ne 0) { throw 'Android TypeScript compilation failed; no release APK was prepared.' }
$devRoot = Join-Path $env:LOCALAPPDATA VaultorAndroidDev
# Windows Store tools may live in the app's filesystem-virtualized physical cache.
$physicalTools = Get-ChildItem (Join-Path $env:LOCALAPPDATA Packages) -Directory -Filter '*Codex*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'LocalCache/Local/VaultorAndroidDev' } | Where-Object { Test-Path (Join-Path $_ 'java/jdk-17.0.20.1+1/bin/java.exe') } | Select-Object -First 1
if ($physicalTools) { $devRoot = $physicalTools }
$env:JAVA_HOME = Join-Path $devRoot 'java/jdk-17.0.20.1+1'
$env:ANDROID_HOME = Join-Path $devRoot sdk
$env:VAULTOR_ANDROID_KEYSTORE = Join-Path $devRoot 'signing/vaultor-android.p12'
$env:VAULTOR_ANDROID_KEY_PASSWORD = Get-Content (Join-Path $devRoot 'signing/password.txt') -Raw
try {
    # Isolate plugin outputs from IDE automatic imports; do not change editor settings.
    $source = Join-Path $mobileRoot 'node_modules/@react-native/gradle-plugin'
    $plugin = Join-Path $devRoot 'gradle-plugin-build'
    $env:VAULTOR_GRADLE_PLUGIN_DIR = $plugin
    Get-ChildItem -LiteralPath $source -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\(build|\.gradle|\.kotlin)\\' } |
        ForEach-Object {
            $destination = Join-Path $plugin $_.FullName.Substring($source.Length + 1)
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
        }
    $gradle = Join-Path $devRoot 'gradle/gradle-9.4.1/bin/gradle.bat'
    $diagnosticFlag = if ($Diagnostics) { 'true' } else { 'false' }
    $nextFlag = if ($NextCandidate) { 'true' } else { 'false' }
    & $gradle --no-daemon -p (Join-Path $mobileRoot android) --project-cache-dir (Join-Path $devRoot project-cache) "-PvaultorDiagnostics=$diagnosticFlag" "-PvaultorNextCandidate=$nextFlag" "-Pkotlin.compiler.execution.strategy=in-process" "-Porg.gradle.java.installations.auto-detect=false" "-Porg.gradle.java.installations.auto-download=false" "-Porg.gradle.java.installations.paths=$env:JAVA_HOME" assembleRelease assembleReleaseAndroidTest --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android release compilation failed' }
    if ($NextCandidate) {
        $apk = Join-Path $mobileRoot 'android/app/build/outputs/apk/release/app-release.apk'
        $signature = & (Join-Path $env:ANDROID_HOME 'build-tools/37.0.0/apksigner.bat') verify --print-certs $apk
        $signer = (Get-Content (Join-Path $mobileRoot release-trust.json) -Raw | ConvertFrom-Json).signerSha256
        $fingerprints = @($signature | Select-String 'certificate SHA-256 digest:')
        if ($LASTEXITCODE -ne 0 -or $fingerprints.Count -ne 1 -or $fingerprints[0].Line -notmatch ("certificate SHA-256 digest: " + [regex]::Escape($signer) + '$')) {
            throw 'Next candidate signature verification failed'
        }
        $destination = Join-Path $mobileRoot 'releases/0.1.0-m24c.1'
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Copy-Item -LiteralPath $apk -Destination (Join-Path $destination 'Vaultor-Next-Android-0.1.0-m24c.1.apk') -Force
    } else {
        & node (Join-Path $PSScriptRoot verify-apk.mjs)
        if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
    }
} finally {
    Remove-Item Env:VAULTOR_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
}
