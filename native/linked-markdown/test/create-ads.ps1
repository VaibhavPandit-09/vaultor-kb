param([string]$Path)
$ErrorActionPreference='Stop'
$nativePath=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Path))
Set-Content -LiteralPath $nativePath -Stream hidden -Value 'ADS data'
