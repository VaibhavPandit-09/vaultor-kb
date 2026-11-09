param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
$work = Join-Path ([IO.Path]::GetTempPath()) ('vaultor-workbook-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
New-Item -ItemType Junction -Path (Join-Path $work 'node_modules') -Target (Join-Path $RuntimeRoot 'node/node_modules') | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'update-workbook.mjs') -Destination $work
& (Join-Path $RuntimeRoot 'node/bin/node.exe') (Join-Path $work 'update-workbook.mjs') $PSScriptRoot
if ($LASTEXITCODE) { throw 'Workbook refresh failed' }
