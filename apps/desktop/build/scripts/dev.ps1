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

function Get-DevProcessIds {
    param(
        [int]$Port,
        [datetime]$StartedAt
    )

    $portPattern = "(?i)--port\s+$Port(?:\s|$)"
    foreach ($processInfo in @(Get-CimInstance Win32_Process)) {
        if ($processInfo.CommandLine -notmatch $portPattern) {
            continue
        }
        $process = Get-Process -Id $processInfo.ProcessId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            continue
        }
        try {
            if ($process.StartTime -lt $StartedAt) {
                continue
            }
        }
        catch {
            continue
        }

        $process.Id
    }
}

function Stop-ProcessTree {
    param(
        [int]$RootProcessId,
        [System.Collections.Generic.HashSet[int]]$KnownProcessIds,
        [System.Collections.Generic.HashSet[int]]$ProtectedProcessIds,
        [int]$VitePort,
        [datetime]$StartedAt
    )

    $processIds = [System.Collections.Generic.HashSet[int]]::new()
    if ($null -ne $KnownProcessIds) {
        foreach ($processId in $KnownProcessIds) {
            [void]$processIds.Add($processId)
        }
    }

    foreach ($process in @(Get-DescendantProcesses -RootProcessId $RootProcessId)) {
        [void]$processIds.Add([int]$process.ProcessId)
    }
    foreach ($processId in @(Get-DevProcessIds -Port $VitePort -StartedAt $StartedAt)) {
        if ($null -eq $ProtectedProcessIds -or -not $ProtectedProcessIds.Contains([int]$processId)) {
            [void]$processIds.Add([int]$processId)
        }
    }

    # Kill the root with its current descendants when possible, then clean up
    # detached task processes individually.
    if ($null -ne (Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue)) {
        & taskkill.exe /PID $RootProcessId /T /F 2>$null | Out-Null
    }

    foreach ($processId in $processIds) {
        if ($processId -eq $RootProcessId) {
            continue
        }
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

$protectedProcessIds = [System.Collections.Generic.HashSet[int]]::new()
foreach ($processId in @(Get-DevProcessIds -Port $VitePort -StartedAt ([datetime]::MinValue))) {
    [void]$protectedProcessIds.Add([int]$processId)
}
$startedAt = Get-Date
$arguments = @('dev', '-config', $configPath, '-port', [string]$VitePort)
$wailsProcess = Start-Process -FilePath $wails.Source -ArgumentList $arguments -WorkingDirectory $desktopRoot -NoNewWindow -PassThru
$appSeen = $false
$appLastSeen = [datetime]::MinValue
$reloadGrace = [timespan]::FromSeconds(2)
$knownProcessIds = [System.Collections.Generic.HashSet[int]]::new()

try {
    while (-not $wailsProcess.HasExited) {
        $descendantProcesses = @(Get-DescendantProcesses -RootProcessId $wailsProcess.Id)
        foreach ($process in $descendantProcesses) {
            [void]$knownProcessIds.Add([int]$process.ProcessId)
        }
        foreach ($processId in @(Get-DevProcessIds -Port $VitePort -StartedAt $startedAt)) {
            if (-not $protectedProcessIds.Contains([int]$processId)) {
                [void]$knownProcessIds.Add([int]$processId)
            }
        }
        $desktopProcesses = @($descendantProcesses | Where-Object Name -eq 'SurveyController.exe')
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
    Stop-ProcessTree -RootProcessId $wailsProcess.Id -KnownProcessIds $knownProcessIds -ProtectedProcessIds $protectedProcessIds -VitePort $VitePort -StartedAt $startedAt
}
