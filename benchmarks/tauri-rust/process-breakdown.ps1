param([int]$RootPid,[string]$Output)
$ErrorActionPreference='Stop'
$all=@(Get-CimInstance Win32_Process)
$ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add($RootPid)
do {$changed=$false;foreach($item in $all){if($ids.Contains([int]$item.ParentProcessId)-and $ids.Add([int]$item.ProcessId)){$changed=$true}}}while($changed)
$perf=@(Get-CimInstance Win32_PerfRawData_PerfProc_Process)
$rows=@(foreach($item in $all){if(!$ids.Contains([int]$item.ProcessId)){continue};$counter=$perf|Where-Object IDProcess -EQ $item.ProcessId|Select-Object -First 1
 $role=if($item.ProcessId-eq $RootPid){'tauri'}elseif($item.CommandLine-match '--type=([^ ]+)'){$Matches[1]}else{'webview-browser'}
 [pscustomobject]@{pid=$item.ProcessId;name=$item.Name;role=$role;workingSet=[double]$item.WorkingSetSize;privateBytes=[double]$item.PrivatePageCount;privateWorkingSet=if($counter){[double]$counter.WorkingSetPrivate}else{$null};cpuSeconds=([double]$item.KernelModeTime+[double]$item.UserModeTime)/10000000}
})
[pscustomobject]@{timestamp=[DateTime]::UtcNow.ToString('o');processes=$rows}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding UTF8
