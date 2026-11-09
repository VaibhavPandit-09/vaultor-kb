param([int]$RootPid, [string]$Output, [string]$StopFile, [switch]$Once)
$ErrorActionPreference = 'Stop'
$samples = [System.Collections.Generic.List[object]]::new()
while (!(Test-Path -LiteralPath $StopFile)) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootPid)
  do { $changed = $false; foreach ($item in $all) { if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true } } } while ($changed)
  $tree = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) })
  if (!$tree.Count) { break }
  $samples.Add([pscustomobject]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    workingSet = ($tree | Measure-Object WorkingSetSize -Sum).Sum
    privateBytes = ($tree | Measure-Object PrivatePageCount -Sum).Sum
    cpuSeconds = (($tree | ForEach-Object { [double]$_.KernelModeTime + [double]$_.UserModeTime } | Measure-Object -Sum).Sum / 10000000)
    javaWorkingSet = (@($tree | Where-Object Name -Like 'java*') | Measure-Object WorkingSetSize -Sum).Sum
    names = @($tree.Name)
  })
  if ($Once) { break }
  Start-Sleep -Milliseconds 500
}
$samples | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Output -Encoding UTF8
