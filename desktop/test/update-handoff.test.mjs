import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {supportsAutomaticInstall,startUpdateHandoff} from '../src/update-handoff.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

test('real helper verifies bytes and rejects changed hash/size without PowerShell module autoload', {skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'vaultor-helper-hash-')),file=join(root,'package.bin'),script=join(root,'verify.ps1');
 const bytes=Buffer.from('Disposable original installer verification vector');await writeFile(file,bytes);
 const helper=fileURLToPath(new URL('../src/update-handoff.ps1',import.meta.url));
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 await writeFile(script,`$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${literal(helper)},[ref]$tokens,[ref]$errors)
$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Verify-Package'},$false)
. ([scriptblock]::Create($fn.Extent.Text))
$PSModuleAutoLoadingPreference='None'
$task=@{installer=${literal(file)};size=${bytes.length};sha256='${createHash('sha256').update(bytes).digest('hex')}'}
Verify-Package
$task.sha256='wrong';$refused=$false;try{Verify-Package}catch{$refused=$_.Exception.Message -eq 'Staged installer changed. Nothing was installed.'};if(-not $refused){throw 'Changed hash admitted'}
$task.sha256='${createHash('sha256').update(bytes).digest('hex')}';$task.size=0;$refused=$false;try{Verify-Package}catch{$refused=$true};if(-not $refused){throw 'Changed size admitted'}
`);
 execFileSync(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-File',script],{windowsHide:true,timeout:30000});
});
test('automatic install requires the actual Windows installer location, not portable/development/Mac',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vaultor-handoff-test-'));const exe=join(root,'Vaultor.exe');assert.equal(await supportsAutomaticInstall(exe,true,'win32'),false);await writeFile(join(root,'Uninstall Vaultor.exe'),'fixture');assert.equal(await supportsAutomaticInstall(exe,true,'win32'),true);assert.equal(await supportsAutomaticInstall(exe,false,'win32'),false);assert.equal(await supportsAutomaticInstall(exe,true,'darwin'),false);assert.equal(await supportsAutomaticInstall(join(root,'electron.exe'),true,'win32'),false);
});
test('real Windows helper refuses a missing installed executable before exit/installation', {skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'vaultor-handoff-test-'));await mkdir(join(root,'updates'));await writeFile(join(root,'package.exe'),'fixture');await assert.rejects(startUpdateHandoff({directory:join(root,'updates'),executable:join(root,'missing','Vaultor.exe'),file:join(root,'package.exe'),manifest:{appVersion:'0.4.1',size:7,sha256:'a'.repeat(64)}}),/Invalid installed application/);
});
