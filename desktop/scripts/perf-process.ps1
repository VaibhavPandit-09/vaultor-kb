# Put this wrapper and all descendants in a Windows kill-on-close job BEFORE
# launching Electron. A crash/timeout/Ctrl+C cannot strand Java or renderer
# children. No elevation or machine-wide process lookup/termination is used.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VaultorPerfJob {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic Limits;
        public Io Counters;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref Extended info, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    // Intentionally retain this handle until wrapper process exit. Closing it
    // earlier would also terminate the wrapper before it returns the exit code.
    static IntPtr handle;
    public static void OwnTree() {
        handle=CreateJobObject(IntPtr.Zero,null);
        var info=new Extended(); info.Limits.Flags=0x2000;
        if(handle==IntPtr.Zero || !SetInformationJobObject(handle,9,ref info,(uint)Marshal.SizeOf(info)) || !AssignProcessToJobObject(handle,GetCurrentProcess()))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Cannot isolate benchmark process tree");
    }
}
'@
[VaultorPerfJob]::OwnTree()
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $env:VAULTOR_PERF_EXECUTABLE
$start.Arguments = '--enable-precise-memory-info "' + $env:VAULTOR_PERF_APP + '"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$child = [System.Diagnostics.Process]::Start($start)
$perfOutput = $child.StandardOutput.ReadToEndAsync()
$perfErrors = $child.StandardError.ReadToEndAsync()
$child.WaitForExit()
[Console]::Out.Write($perfOutput.GetAwaiter().GetResult())
[Console]::Error.Write($perfErrors.GetAwaiter().GetResult())
exit $child.ExitCode
