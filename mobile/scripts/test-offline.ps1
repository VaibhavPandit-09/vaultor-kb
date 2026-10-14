param(
 [Parameter(Mandatory=$true)][ValidateSet('emulator-5554','emulator-5556')][string]$Serial,
 [Parameter(Mandatory=$true)][ValidateSet('store','download','offline','crash','resume','revoked','upgrade')][string]$Stage,
 [switch]$Install
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
Remove-Item Env:VAULTOR_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
$mobileRoot=Split-Path $PSScriptRoot
$fixture=Get-Content (Join-Path $mobileRoot 'cache/fixture.json') -Raw | ConvertFrom-Json
if($fixture.address -notmatch '^https://127\.0\.0\.1:\d+$' -or !$fixture.readerFixture){throw 'Explicit disposable reader fixture required; no personal server or phone.'}
if($Install){
 $version=(Get-Content (Join-Path $mobileRoot 'package.json') -Raw | ConvertFrom-Json).version
 & adb -s $Serial install -r (Join-Path $mobileRoot "releases/$version/Vaultor-Android-$version.apk")
 if($LASTEXITCODE -ne 0){throw 'Release APK install failed'}
 & adb -s $Serial install -r (Join-Path $mobileRoot 'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk')
 if($LASTEXITCODE -ne 0){throw 'Instrumentation install failed'}
}
if($Stage -eq 'offline') {
 $routes=& adb -s $Serial reverse --list
 if($LASTEXITCODE -ne 0){throw 'Cannot inspect explicit emulator routes'}
 if(($routes -join "`n") -match "tcp:$($fixture.port)\s") { & adb -s $Serial reverse --remove "tcp:$($fixture.port)" }
} else { & adb -s $Serial reverse "tcp:$($fixture.port)" "tcp:$($fixture.port)" }
if($LASTEXITCODE -ne 0){throw 'Cannot configure explicit emulator fixture route'}
& adb -s $Serial shell am force-stop com.vaultor.app
if($LASTEXITCODE -ne 0){throw 'Cannot stop emulator fixture app'}
$methods=@{download='pinnedHttpsDownloadAndSeed';offline='disconnectedColdReaderAndMedia';crash='crashDuringRefresh';resume='resumeAfterProcessDeath';revoked='verifiedRevocationLocksColdCopy'}
$class=if($Stage -eq 'store'){'com.vaultorandroid.CompanionStoreTest'}elseif($Stage -eq 'upgrade'){'com.vaultorandroid.ReaderUpgradeTest#upgradeRetainsAndFreezes'}else{'com.vaultorandroid.CompanionExperienceTest#'+$methods[$Stage]}
$output=& adb -s $Serial shell am instrument -w -e readerId $fixture.readerFixture.noteId -e pdfId $fixture.readerFixture.pdf -e imageId $fixture.readerFixture.image1 -e class $class com.vaultor.app.test/androidx.test.runner.AndroidJUnitRunner
$output | Write-Output
if($Stage -eq 'crash') {
 if(($output -join "`n") -notmatch 'Process crashed'){throw 'Expected intentional mid-payload process death did not occur'}
 Write-Output 'Intentional interruption observed. Resume gate is still required.'
} elseif($LASTEXITCODE -ne 0 -or ($output -join "`n") -notmatch 'OK \([1-9][0-9]* tests?\)') {throw "$Stage failed; stop before publication"}
