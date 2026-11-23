param([string]$Config = 'src-tauri/tauri.windows-release.conf.json', [switch]$Qualification)
$ErrorActionPreference = 'Stop'
$options = @()
if ($Qualification) {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
        throw 'The qualification build is restricted to disposable hosted runners'
    }
    $options = @('--features', 'qualification-feed')
}
$nextRoot = Split-Path $PSScriptRoot
$sources = Join-Path $nextRoot 'src-tauri/windows'
$output = Join-Path $nextRoot 'src-tauri/target/release/vaultor-legacy-replacement.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
New-Item -ItemType Directory -Path (Split-Path $output) -Force | Out-Null
$resources = foreach ($version in '0.27.0','0.26.0','0.25.2') {
    '/resource:' + (Join-Path $sources "legacy-$version.tsv") + ',' + $version
}
& $compiler /nologo /target:exe /optimize+ /platform:x64 "/out:$output" @resources (Join-Path $sources 'LegacyReplacement.cs')
if ($LASTEXITCODE -ne 0) { throw 'Legacy replacement helper compilation failed' }
Push-Location $nextRoot
try {
    & npm.cmd exec tauri build -- --config $Config --bundles nsis @options
    if ($LASTEXITCODE -ne 0) { throw 'Vaultor Next packaging failed' }
} finally {
    Pop-Location
}
