[CmdletBinding()]
param(
    [ValidateSet('restore', 'build', 'rebuild', 'clean', 'package', 'preview', 'test')]
    [string]$Action = 'build',
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug'
)

$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$wpfRoot = Join-Path $desktopRoot 'native-wpf'
$solution = Join-Path $wpfRoot 'SurveyController.sln'
$testProject = Join-Path $wpfRoot 'tests\SurveyController.Core.Tests\SurveyController.Core.Tests.csproj'
$appProject = Join-Path $wpfRoot 'src\SurveyController.App\SurveyController.App.csproj'
$packageRoot = Join-Path $desktopRoot 'bin\wpf-x64'
$installerOutput = Join-Path $desktopRoot 'bin\SurveyController-wpf-installer.exe'
$installerZipOutput = Join-Path $desktopRoot 'bin\SurveyController-wpf-portable.zip'
$installerIcon = Join-Path $repoRoot 'assets\icon.ico'

if ($Action -eq 'package') {
    $Configuration = 'Release'
}

$outputDir = Join-Path $wpfRoot "src\SurveyController.App\bin\$Configuration\net48"
$backendOutput = Join-Path $outputDir 'SurveyController.Backend.exe'

if ($Action -eq 'restore') {
    & dotnet restore $solution
    exit $LASTEXITCODE
}

if ($Action -eq 'test') {
    & dotnet test $testProject --nologo -c $Configuration
    exit $LASTEXITCODE
}

if ($Action -in @('build', 'rebuild', 'package', 'preview')) {
    $target = if ($Action -eq 'rebuild') { 'Rebuild' } else { 'Build' }
    
    Write-Host "==> Building SurveyController (.NET 4.8 / WPF) [$Configuration]..." -ForegroundColor Cyan
    & dotnet build $appProject --nologo -c $Configuration "/t:$target"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "==> Building SurveyController Go Backend..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    $goArguments = @('build', '-buildvcs=false', '-o', $backendOutput)
    if ($Configuration -eq 'Release') {
        $goArguments = @('build', '-buildvcs=false', '-trimpath', '-ldflags=-s -w', '-o', $backendOutput)
    }
    Push-Location -LiteralPath $desktopRoot
    try {
        & go @goArguments '.'
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

if ($Action -eq 'preview') {
    $previewExecutable = Join-Path $outputDir 'SurveyController.exe'
    if (-not (Test-Path -LiteralPath $previewExecutable)) {
        throw "未找到 WPF 程序：$previewExecutable"
    }
    $developmentRoot = Join-Path $env:LOCALAPPDATA 'SurveyController\Development'
    $previousConfigHome = $env:SURVEYCONTROLLER_CONFIG_HOME
    $previousLocalDataHome = $env:SURVEYCONTROLLER_LOCAL_DATA_HOME
    try {
        $env:SURVEYCONTROLLER_CONFIG_HOME = Join-Path $developmentRoot 'Config'
        $env:SURVEYCONTROLLER_LOCAL_DATA_HOME = Join-Path $developmentRoot 'LocalData'
        Start-Process -FilePath $previewExecutable
    } finally {
        $env:SURVEYCONTROLLER_CONFIG_HOME = $previousConfigHome
        $env:SURVEYCONTROLLER_LOCAL_DATA_HOME = $previousLocalDataHome
    }
    exit 0
}

if ($Action -ne 'package') {
    exit 0
}

Write-Host "==> Packaging release payload..." -ForegroundColor Cyan
$binRoot = Split-Path -Parent $packageRoot
New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

$excludedExtensions = @('.pdb', '.xml')
Get-ChildItem -LiteralPath $outputDir -Recurse -File |
    Where-Object {
        $excludedExtensions -notcontains $_.Extension.ToLowerInvariant()
    } |
    ForEach-Object {
        $relativePath = $_.FullName.Substring($outputDir.Length).TrimStart('\', '/')
        $destination = Join-Path $packageRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }

if (Test-Path $installerZipOutput) {
    Remove-Item $installerZipOutput -Force
}
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $installerZipOutput
$zipSizeMb = (Get-Item $installerZipOutput).Length / 1MB
Write-Host ("==> Portable zip package created: {0:N2} MB -> {1}" -f $zipSizeMb, $installerZipOutput) -ForegroundColor Green

# If NSIS makensis is installed, also build standard installer
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if ($makensis) {
    Write-Host "==> Building NSIS installer..." -ForegroundColor Cyan
    $configText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.yml') -Raw
    $versionMatch = [regex]::Match($configText, '(?m)^\s+version:\s*["'']?([^"''#\r\n]+)')
    $version = if ($versionMatch.Success) { $versionMatch.Groups[1].Value.Trim() } else { "1.0.0" }
    
    & $makensis `
        '/INPUTCHARSET' `
        'UTF8' `
        '-DINFO_COMPANYNAME=HUNGRY_M0' `
        '-DINFO_PRODUCTNAME=SurveyController' `
        "-DINFO_PRODUCTVERSION=$version" `
        '-DINFO_COPYRIGHT=(c) 2026, HUNGRY_M0' `
        "-DARG_NATIVE_PAYLOAD=$packageRoot" `
        "-DARG_INSTALLER_OUTPUT=$installerOutput" `
        "-DARG_INSTALLER_ICON=$installerIcon" `
        (Join-Path $desktopRoot 'build\windows\nsis\project.nsi')
    if ($LASTEXITCODE -eq 0) {
        $installerSizeMb = (Get-Item $installerOutput).Length / 1MB
        Write-Host ("==> NSIS installer created: {0:N2} MB -> {1}" -f $installerSizeMb, $installerOutput) -ForegroundColor Green
    }
}

Write-Host "==> Packaging complete." -ForegroundColor Green
exit 0
