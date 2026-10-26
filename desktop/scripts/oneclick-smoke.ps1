param([Parameter(Mandatory=$true)][string]$Installer, [Parameter(Mandatory=$true)][string]$PriorInstaller, [switch]$Interactive)
$ErrorActionPreference = 'Stop'
$existing = Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall | Get-ItemProperty | Where-Object DisplayName -EQ 'Vaultor'
if ($existing) { throw 'Vaultor is installed already. This test needs a disposable Windows account; it will not replace your installation.' }
$root = Join-Path ([IO.Path]::GetTempPath()) ('vaultor-oneclick-' + [Guid]::NewGuid())
$appPath = Join-Path $root 'app'
$dataPath = Join-Path $root 'profile'
$updatesPath = Join-Path $root 'updates'
if($Interactive){$updatesPath=Join-Path $dataPath 'updates'}
New-Item -ItemType Directory -Path $appPath,$dataPath,$updatesPath -Force | Out-Null
$links = @(@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs')) | ForEach-Object {Join-Path $_ 'Vaultor.lnk'} | Where-Object {Test-Path -LiteralPath $_} | ForEach-Object { $backup=Join-Path $root ([Guid]::NewGuid().ToString()+'.lnk');Copy-Item -LiteralPath $_ -Destination $backup;[PSCustomObject]@{Original=$_;Backup=$backup}})
$links | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'shortcut-backups.json')
$target = Join-Path $appPath 'Vaultor.exe'
$env:VAULTOR_DESKTOP_TEST_DIRECTORY=$dataPath
if($Interactive){$env:VAULTOR_UPDATE_VISIBILITY_CHECK='1'}else{$env:VAULTOR_UPDATE_RELAUNCH_CHECK='1'}
$sentinel = Join-Path $dataPath 'retain.txt'
Set-Content -LiteralPath $sentinel -Value 'Retain isolated user data'
try {
    $prior=(Resolve-Path -LiteralPath $PriorInstaller).Path
    $install=Start-Process -FilePath $prior -ArgumentList @('/S',"/D=$appPath") -WindowStyle Hidden -PassThru -Wait
    if($install.ExitCode -ne 0){throw 'Prior install failed'}
    $previousVersion=(Get-Content -LiteralPath (Join-Path $appPath 'resources\app\package.json') -Raw|ConvertFrom-Json).version
    $release=(Resolve-Path -LiteralPath $Installer).Path
    if($Interactive){
        & node "$PSScriptRoot\stage-update-ui.mjs" $dataPath $release $previousVersion
        if($LASTEXITCODE -ne 0){throw 'Signed staging failed'}
        Start-Process -FilePath $target -WindowStyle Normal | Out-Null
        Write-Output "Use the real Updates UI in the disposable $previousVersion installation: $root"
    }else{
        & node "$PSScriptRoot\update-handoff-parent.mjs" $updatesPath $target $release
        if($LASTEXITCODE -ne 0){throw 'Handoff readiness failed'}
    }
    $deadline=[DateTime]::UtcNow.AddMinutes(8)
    $resultPath=Join-Path $dataPath 'update-relaunch.json'
    while(-not(Test-Path -LiteralPath $resultPath)-and [DateTime]::UtcNow -lt $deadline){
        $statusFile=Join-Path $updatesPath 'handoff-status.json'
        if(Test-Path -LiteralPath $statusFile){$state=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json;if($state.phase -eq 'error'){throw $state.error}}
        Start-Sleep -Milliseconds 300
    }
    if(-not(Test-Path -LiteralPath $resultPath)){throw 'Upgraded app did not relaunch and confirm startup'}
    $result=Get-Content -LiteralPath $resultPath -Raw|ConvertFrom-Json
    $expected=(Get-Content -LiteralPath ($release+'.vaultor.json') -Raw|ConvertFrom-Json).manifest.appVersion
    if($result.version -ne $expected -or -not $result.ready -or -not(Test-Path -LiteralPath $sentinel)){throw 'Version/startup/data preservation check failed'}
    if($Interactive){
        if(-not $result.visible -or -not $result.focused -or -not $result.reopenIntent){throw 'Update did not return to a visible focused window'}
        if($result.restoredText -notlike '*Update visibility fixture*'){throw 'Managed editor session did not restore after update'}
        Write-Output 'Real Update and restart returned visibly/focused with the managed editor session restored.'
    }else{
        $handoff=Get-Content -LiteralPath (Join-Path $updatesPath 'handoff-status.json') -Raw|ConvertFrom-Json
        if($handoff.phase -ne 'complete'){throw 'Handoff did not complete'}
    }
    Write-Output "Silent helper upgrade $previousVersion -> $expected, relaunch, bundled server startup and isolated data retention passed: $root"
} finally {
    # Touch only this resolved test installation. Never stop unrelated Vaultor/Java processes.
    $resolvedRoot=[IO.Path]::GetFullPath($root)
    $resolvedApp=[IO.Path]::GetFullPath($appPath)
    if(-not $resolvedApp.StartsWith($resolvedRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Unexpected test installation target'}
    try {
        Get-Process Vaultor -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $target} | ForEach-Object {
            $ownedPid=$_.Id
            try {Stop-Process -Id $ownedPid -ErrorAction Stop}
            catch {if(Get-Process -Id $ownedPid -ErrorAction SilentlyContinue){throw}}
        }
        $uninstaller=Join-Path $appPath 'Uninstall Vaultor.exe'
        if(Test-Path -LiteralPath $uninstaller){$remove=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait;if($remove.ExitCode -ne 0){throw 'Disposable uninstall failed'}}
    } finally {
        foreach($link in $links){Copy-Item -LiteralPath $link.Backup -Destination $link.Original -Force}
        Remove-Item Env:\VAULTOR_DESKTOP_TEST_DIRECTORY -ErrorAction SilentlyContinue
        Remove-Item Env:\VAULTOR_UPDATE_RELAUNCH_CHECK -ErrorAction SilentlyContinue
        Remove-Item Env:\VAULTOR_UPDATE_VISIBILITY_CHECK -ErrorAction SilentlyContinue
    }
}
