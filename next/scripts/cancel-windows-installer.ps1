param([Parameter(Mandatory)][int]$InstallerPid)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Use a disposable hosted runner only'
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class InstallerCancel {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr dialog, int control);
    [DllImport("user32.dll")]
    public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr command, IntPtr control);
}
'@
for ($attempt = 0; $attempt -lt 80; $attempt++) {
    $installer = Get-Process -Id $InstallerPid
    if ($installer.MainWindowHandle -ne [IntPtr]::Zero) {
        $dialog = $installer.MainWindowHandle
        $cancel = [InstallerCancel]::GetDlgItem($dialog, 2)
        if ($cancel -ne [IntPtr]::Zero -and [InstallerCancel]::IsWindowEnabled($cancel)) {
            if (![InstallerCancel]::PostMessage($dialog, 0x111, [IntPtr]2, $cancel)) {
                throw 'Could not send the native Cancel command'
            }
            exit 0
        }
    }
    Start-Sleep -Milliseconds 250
}
throw 'The exact installer did not expose its Cancel button'
