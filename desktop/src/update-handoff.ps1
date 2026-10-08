param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
$task = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$statusPath = Join-Path (Split-Path -Parent $Config) 'handoff-status.json'
function Status([string]$Phase, [string]$Message = '') {
    @{phase=$Phase; error=$Message; version=$task.version} | ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
}
function Verify-Package {
    $file = Get-Item -LiteralPath $task.installer
    if ($file.Length -ne $task.size -or (Get-FileHash -LiteralPath $task.installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $task.sha256) { throw 'Staged installer changed. Nothing was installed.' }
}
try {
    $target = [IO.Path]::GetFullPath($task.executable)
    $installDirectory = Split-Path -Parent $target
    if ((Split-Path -Leaf $target) -ne 'Vaultor.exe' -or -not (Test-Path -LiteralPath $target) -or $target.Contains('"')) { throw 'Invalid installed application location.' }
    Verify-Package
    $parent = Get-Process -Id $task.parentPid -ErrorAction SilentlyContinue
    if ($parent) {
        if ([Math]::Abs(($parent.StartTime.ToUniversalTime() - [DateTime]::Parse($task.parentStartedAt).ToUniversalTime()).TotalSeconds) -gt 2) { throw 'The updater parent process changed. Retry from Vaultor.' }
        Status 'ready'
        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        # The parent may exit between Get-Process and Wait-Process. Poll its
        # identity instead so that ordinary shutdown is not treated as failure.
        while ($true) {
            $current = Get-Process -Id $task.parentPid -ErrorAction SilentlyContinue
            if (-not $current) { break }
            try { $started = $current.StartTime.ToUniversalTime() } catch { break }
            if ([Math]::Abs(($started - [DateTime]::Parse($task.parentStartedAt).ToUniversalTime()).TotalSeconds) -gt 2) { break }
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Vaultor did not finish closing. Nothing was installed; retry.' }
            Start-Sleep -Milliseconds 100
        }
    } else { Status 'ready' }
    Verify-Package
    Status 'installing'
    # Keep installation in its existing directory. No force-run: the helper relaunches after validation.
    $installer = Start-Process -FilePath $task.installer -ArgumentList @('/S', '--updated', '/currentuser', "/D=$installDirectory") -WindowStyle Hidden -PassThru -Wait
    if ($installer.ExitCode -ne 0) { throw "Installer failed with exit code $($installer.ExitCode). Open Updates to retry or recover." }
    $packagePath = Join-Path $installDirectory 'resources\app\package.json'
    if ((Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version -ne $task.version) { throw 'Installed version did not match the verified update. Review recovery.' }
    Status 'complete'
    Start-Process -FilePath $target -WindowStyle Hidden | Out-Null
} catch {
    Status 'error' $_.Exception.Message
    # Do not attempt a database rollback. Reopen the app to expose retained update/recovery state.
    if ($target -and (Test-Path -LiteralPath $target)) { Start-Process -FilePath $target -WindowStyle Hidden | Out-Null }
    exit 1
}
