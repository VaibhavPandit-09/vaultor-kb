param([string]$Application)
$ErrorActionPreference='Stop'
if($Application){$env:ATLAS_APP=(Resolve-Path -LiteralPath $Application).Path}
try { & node "$PSScriptRoot\atlas.mjs" open; if($LASTEXITCODE -ne 0){throw 'Atlas launch failed. Keep its storage and inspect the reported error.'} }
finally { if($Application){Remove-Item Env:\ATLAS_APP -ErrorAction SilentlyContinue} }
