param([Parameter(Mandatory)][int]$InstallerPid)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Use a disposable hosted runner only'
}
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
for ($attempt = 0; $attempt -lt 80; $attempt++) {
    $installer = Get-Process -Id $InstallerPid
    if ($installer.MainWindowHandle -ne [IntPtr]::Zero) {
        $window = [Windows.Automation.AutomationElement]::FromHandle($installer.MainWindowHandle)
        $label = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, 'Cancel')
        $button = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $label)
        if ($null -ne $button) {
            $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
            exit 0
        }
    }
    Start-Sleep -Milliseconds 250
}
throw 'The exact installer did not expose its Cancel button'
