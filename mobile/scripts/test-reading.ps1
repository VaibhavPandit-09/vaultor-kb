param(
  [Parameter(Mandatory=$true)][ValidateSet('emulator-5554','emulator-5556')][string]$Serial,
  [ValidateSet('all','services','interaction','journey','cold','appearance','upgrade')][string]$Stage='all',
  [switch]$Install
)
$ErrorActionPreference='Stop'
$mobileRoot=Split-Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'android-env.ps1')
Remove-Item Env:VAULTOR_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
$fixture=Get-Content (Join-Path $mobileRoot 'cache/fixture.json') -Raw | ConvertFrom-Json
if($fixture.address -notmatch '^https://127\.0\.0\.1:\d+$' -or !$fixture.readerFixture){throw 'An explicit disposable R2 loopback fixture is required.'}
$version=(Get-Content (Join-Path $mobileRoot 'package.json') -Raw | ConvertFrom-Json).version
if($Install){
  & adb -s $Serial install -r (Join-Path $mobileRoot "releases/$version/Vaultor-Android-$version.apk")
  if($LASTEXITCODE -ne 0){throw 'Release APK install failed'}
  & adb -s $Serial install -r (Join-Path $mobileRoot 'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk')
  if($LASTEXITCODE -ne 0){throw 'Test APK install failed'}
}
& adb -s $Serial reverse "tcp:$($fixture.port)" "tcp:$($fixture.port)"
if($LASTEXITCODE -ne 0){throw 'Emulator fixture forwarding failed'}
$cases=[ordered]@{services='presentationAndPdfNative';interaction='richReaderInteraction';journey='journeysAndColdRestoreSeed';cold='coldReadingRestoration';appearance='themesAndMotion';upgrade='upgradeRetainsAndFreezes'}
foreach($name in $cases.Keys){
  if($Stage -ne 'all' -and $Stage -ne $name){continue}
  & adb -s $Serial shell am force-stop com.vaultor.app
  if($LASTEXITCODE -ne 0){throw 'Cannot stop emulator test app'}
  $class=if($name -eq 'upgrade'){'com.vaultorandroid.ReaderUpgradeTest'}else{'com.vaultorandroid.ReaderExperienceTest'}
  $output=& adb -s $Serial shell am instrument -w -e pdfId $fixture.readerFixture.pdf -e lockedId $fixture.readerFixture.locked -e imageId $fixture.readerFixture.image1 -e class "$class#$($cases[$name])" com.vaultor.app.test/androidx.test.runner.AndroidJUnitRunner
  $output | Write-Output
  if($LASTEXITCODE -ne 0 -or ($output -join "`n") -notmatch 'OK \(1 test\)'){throw "$name failed; subsequent checks were not run."}
}
