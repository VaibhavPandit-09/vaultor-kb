param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z]:\\$')][string]$SecondaryVolume)
$ErrorActionPreference='Stop'
$repository=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $repository
try {
    $output=Join-Path $repository ('desktop/cache/linked-check-'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
    New-Item -ItemType Directory -Path $output | Out-Null
    & javac -d native/linked-markdown/build native/linked-markdown/src/vaultor/linked/*.java native/linked-markdown/test/vaultor/linked/*.java
    if($LASTEXITCODE -ne 0){throw 'Native compilation failed'}
    $checks=@('LinkedPublicationTests','LinkedMetadataTests','LinkedParentPermissionTests','LinkedAliasTests','LinkedCrashTests','LinkedRecoveryTests','LinkedRetentionTests','LinkedReadonlyTests','LinkedDirectoryTests','LinkedExportTests','LinkedVolumeTests')
    foreach($check in $checks){
        $log=Join-Path $output ($check+'.log')
        $arguments=@('--enable-native-access=ALL-UNNAMED','-cp','native/linked-markdown/build',('vaultor.linked.'+$check))
        if($check -eq 'LinkedVolumeTests'){$arguments+=$SecondaryVolume}
        & java @arguments *> $log
        if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $log -Tail 60;throw ($check+' failed; '+$log)}
        $summary=Get-Content -LiteralPath $log -Tail 1
        Write-Output ($check+': '+$summary)
    }
    Write-Output ('Logs: '+$output)
} finally {Pop-Location}
