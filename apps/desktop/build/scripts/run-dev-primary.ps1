param()

$ErrorActionPreference = 'Stop'

function Find-WailsDevProcess {
    $processes = @{}
    Get-CimInstance Win32_Process | ForEach-Object {
        $processes[[int]$_.ProcessId] = $_
    }

    $current = $processes[$PID]
    $visited = @{}
    while ($null -ne $current) {
        $parentId = [int]$current.ParentProcessId
        if ($parentId -le 0 -or $visited.ContainsKey($parentId)) {
            break
        }
        $visited[$parentId] = $true

        $parent = $processes[$parentId]
        if ($null -eq $parent) {
            break
        }

        if ($parent.Name -ieq 'wails3.exe' -and $parent.CommandLine -match '(?i)(^|[\s"''])dev([\s"'']|$)') {
            return $parent
        }
        $current = $parent
    }

    return $null
}

$devProcess = Find-WailsDevProcess
$exitCode = 1
try {
    & wails3 task run
    $exitCode = $LASTEXITCODE
}
finally {
    if ($null -ne $devProcess) {
        $devProcessId = [int]$devProcess.ProcessId
        $currentDevProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $devProcessId" -ErrorAction SilentlyContinue
        if (
            $null -ne $currentDevProcess -and
            $currentDevProcess.Name -ieq 'wails3.exe' -and
            $currentDevProcess.CreationDate -eq $devProcess.CreationDate -and
            $currentDevProcess.CommandLine -match '(?i)(^|[\s"''])dev([\s"'']|$)'
        ) {
            & taskkill.exe /PID $devProcessId /T /F *> $null
        }
    }
}

exit $exitCode
