[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Version = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",

    [Parameter(Mandatory = $false)]
    [string]$ReleaseDir = "Releases\win\stable",

    [switch]$SkipClean
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-RepoRoot {
    $scriptRoot = $PSScriptRoot
    if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
        $scriptRoot = Split-Path -Parent $PSCommandPath
    }
    return (Resolve-Path (Join-Path $scriptRoot "..")).Path
}

function Resolve-Version {
    param(
        [string]$RepoRoot,
        [string]$ProvidedVersion
    )

    if (-not [string]::IsNullOrWhiteSpace($ProvidedVersion)) {
        $version = $ProvidedVersion.Trim()
        if ($version.StartsWith("v")) {
            return $version
        }
        return "v$version"
    }

    $configPath = Join-Path $RepoRoot "apps\desktop\build\config.yml"
    $configText = Get-Content -LiteralPath $configPath -Raw
    $match = [regex]::Match($configText, '(?m)^\s*version:\s*"([^"]+)"')
    if (-not $match.Success) {
        throw ("Failed to resolve version from: {0}" -f $configPath)
    }
    $version = $match.Groups[1].Value.Trim()
    if ($version.StartsWith("v")) {
        return $version
    }
    return "v$version"
}

function Set-DesktopVersion {
    param(
        [string]$RepoRoot,
        [string]$Version
    )

    if ([string]::IsNullOrWhiteSpace($Version)) {
        return
    }

    $rawVersion = $Version.Trim()
    if ($rawVersion.StartsWith("v")) {
        $rawVersion = $rawVersion.Substring(1)
    }
    if ([string]::IsNullOrWhiteSpace($rawVersion)) {
        throw "Version cannot be empty."
    }

    $configPath = Join-Path $RepoRoot "apps\desktop\build\config.yml"
    $configText = Get-Content -LiteralPath $configPath -Raw
    $nextText = [regex]::Replace(
        $configText,
        '(?m)^(\s*version:\s*")[^"]+(".*)$',
        ('${1}' + $rawVersion + '${2}'),
        1
    )
    if ($nextText -eq $configText) {
        throw ("Failed to update version in: {0}" -f $configPath)
    }
    Set-Content -LiteralPath $configPath -Value $nextText -NoNewline
}

function Invoke-WailsTask {
    param(
        [string]$DesktopRoot,
        [string]$Arch
    )

    Push-Location $DesktopRoot
    try {
        wails3 task windows:package ARCH=$Arch INSTALL_SCOPE=user
        if ($LASTEXITCODE -ne 0) {
            throw ("Windows package task failed with exit code {0}." -f $LASTEXITCODE)
        }
    }
    finally {
        Pop-Location
    }
}

$repoRoot = Resolve-RepoRoot
Set-DesktopVersion -RepoRoot $repoRoot -Version $Version
$desktopRoot = Join-Path $repoRoot "apps\desktop"
$binRoot = Join-Path $desktopRoot "bin"
$releaseRoot = Join-Path $repoRoot $ReleaseDir
$packVersion = Resolve-Version -RepoRoot $repoRoot -ProvidedVersion $Version

$installerName = "SurveyController-$Arch-installer.exe"
$versionedInstallerName = "SurveyController $packVersion.exe"

Write-Step "Check environment"

Write-Host ("Repo root: {0}" -f $repoRoot)
Write-Host ("Desktop root: {0}" -f $desktopRoot)
Write-Host ("Release dir: {0}" -f $releaseRoot)
Write-Host ("Version: {0}" -f $packVersion)
Write-Host ("Arch: {0}" -f $Arch)
Write-Host "Install scope: user"

if (-not $SkipClean) {
    Write-Step "Clean old desktop build artifacts"
    foreach ($path in @($binRoot, $releaseRoot)) {
        if (Test-Path $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}

Write-Step "Build Windows installer"
Invoke-WailsTask -DesktopRoot $desktopRoot -Arch $Arch

Write-Step "Copy release artifacts"
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

$installerPath = Join-Path $binRoot $installerName

if (-not (Test-Path $installerPath)) {
    throw ("Installer not found: {0}" -f $installerPath)
}

$archInstallerPath = Join-Path $releaseRoot $installerName
if (Test-Path $archInstallerPath) {
    Remove-Item -LiteralPath $archInstallerPath -Force
}
Copy-Item -Force $installerPath $archInstallerPath
Copy-Item -Force $installerPath (Join-Path $releaseRoot $versionedInstallerName)

Write-Step "Build finished"
Get-ChildItem -LiteralPath $releaseRoot | Sort-Object Name | Format-Table Name, Length, LastWriteTime -AutoSize

Write-Host ""
Write-Host ("Release dir: {0}" -f $releaseRoot) -ForegroundColor Green
Write-Host ("Installer: {0}" -f (Join-Path $releaseRoot $versionedInstallerName)) -ForegroundColor Green
