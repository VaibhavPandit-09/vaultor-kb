param([switch]$SkipWorkerBuild)
$ErrorActionPreference='Stop'
$repository=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $repository
try {
 if(-not $SkipWorkerBuild){Push-Location frontend;try {& npx.cmd vite build --config vite.markdown-g1.config.ts;if($LASTEXITCODE -ne 0){throw 'Isolated worker build failed'}}finally{Pop-Location}}
 New-Item -ItemType Directory -Force native/linked-markdown/build,native/linked-markdown/.scratch,native/linked-markdown/evidence | Out-Null
 & javac -d native/linked-markdown/build native/linked-markdown/src/vaultor/linked/*.java native/linked-markdown/test/vaultor/linked/*.java
 if($LASTEXITCODE -ne 0){throw 'Native Java compilation failed'}
 & java --enable-native-access=ALL-UNNAMED -cp native/linked-markdown/build vaultor.linked.SafetyTests *> native/linked-markdown/evidence/native-run.log
 if($LASTEXITCODE -ne 0){Get-Content native/linked-markdown/evidence/native-run.log;throw 'Native qualification failed'}
 & node --test native/linked-markdown/desktop-consent.test.mjs *> native/linked-markdown/evidence/consent-tests.log
 if($LASTEXITCODE -ne 0){throw 'Consent checks failed'}
 Get-Content native/linked-markdown/evidence/native-tests.txt -Tail 1
 Get-Content native/linked-markdown/evidence/consent-tests.log -Tail 8
} finally {Pop-Location}
