param(
    [int]$VitePort = 9245,
    [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$configPath = Join-Path $desktopRoot 'build\config.yml'
$wails = Get-Command wails3 -ErrorAction Stop

function Get-DescendantProcesses {
    param([int]$RootProcessId)

    $all = @(Get-CimInstance Win32_Process)
    $pending = [System.Collections.Generic.Queue[int]]::new()
    $pending.Enqueue($RootProcessId)
    $result = [System.Collections.Generic.List[object]]::new()

    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($process in $all) {
            if ($process.ParentProcessId -ne $parentId) {
                continue
            }
            $result.Add($process)
            $pending.Enqueue([int]$process.ProcessId)
        }
    }

    return $result
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $process = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return
    }
    & taskkill.exe /PID $RootProcessId /T /F 2>$null | Out-Null
}

$arguments = @('dev', '-config', $configPath, '-port', [string]$VitePort)
$wailsProcess = Start-Process -FilePath $wails.Source -ArgumentList $arguments -WorkingDirectory $desktopRoot -NoNewWindow -PassThru
$appSeen = $false
$appLastSeen = [datetime]::MinValue
$startedAt = Get-Date
$reloadGrace = [timespan]::FromSeconds(2)

try {
    while (-not $wailsProcess.HasExited) {
        $desktopProcesses = @(Get-DescendantProcesses -RootProcessId $wailsProcess.Id | Where-Object Name -eq 'SurveyController.exe')
        if ($desktopProcesses.Count -gt 0) {
            $appSeen = $true
            $appLastSeen = Get-Date
        }
        elseif ($appSeen -and ((Get-Date) - $appLastSeen) -ge $reloadGrace) {
            break
        }
        elseif (-not $appSeen -and ((Get-Date) - $startedAt).TotalSeconds -ge $StartupTimeoutSeconds) {
            throw "Timed out waiting for SurveyController.exe to start."
        }

        Start-Sleep -Milliseconds 300
        $wailsProcess.Refresh()
    }

    if ($wailsProcess.HasExited -and $wailsProcess.ExitCode -ne 0) {
        exit $wailsProcess.ExitCode
    }
}
finally {
    Stop-ProcessTree -RootProcessId $wailsProcess.Id
}
