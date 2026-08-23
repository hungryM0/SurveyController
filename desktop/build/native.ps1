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
$solution = Join-Path $desktopRoot 'native-cs\SurveyController.sln'
$appProject = Join-Path $desktopRoot 'native-cs\src\SurveyController.App\SurveyController.App.csproj'
$testProject = Join-Path $desktopRoot 'native-cs\tests\SurveyController.Core.Tests\SurveyController.Core.Tests.csproj'
$packageRoot = Join-Path $desktopRoot 'bin\native-x64'
$installerOutput = Join-Path $desktopRoot 'bin\SurveyController-amd64-installer.exe'
$installerIcon = Join-Path $repoRoot 'assets\icon.ico'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw '未找到 dotnet CLI。请安装 .NET SDK 8 或更新版本。'
}

function Resolve-AppOutputDirectory {
    param([string]$Configuration)

    # dotnet 输出路径包含 TFM 段，按 exe 实际位置解析而不是硬编码。
    $binRoot = Join-Path $desktopRoot "native-cs\src\SurveyController.App\bin\x64\$Configuration"
    $executable = Get-ChildItem -LiteralPath $binRoot -Recurse -Filter 'SurveyController.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $executable) {
        return $null
    }
    return $executable.DirectoryName
}

if ($Action -eq 'restore') {
    & dotnet restore $solution
    exit $LASTEXITCODE
}

if ($Action -eq 'clean') {
    & dotnet clean $solution -p:Platform=x64
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    exit 0
}

if ($Action -eq 'test') {
    & dotnet test $testProject -c $Configuration --logger "console;verbosity=minimal"
    exit $LASTEXITCODE
}

if ($Action -eq 'package') {
    $Configuration = 'Release'
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw '未找到 Go 工具链。'
}

# 先构建托管壳（rebuild 会清空输出目录），再把 Go 后端产物放进 exe 同目录。
$dotnetTarget = switch ($Action) {
    'rebuild' { 'Rebuild' }
    default { 'Build' }
}
& dotnet build $appProject -c $Configuration -p:Platform=x64 "-t:$dotnetTarget" /restore
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$appOutput = Resolve-AppOutputDirectory -Configuration $Configuration
if (-not $appOutput) {
    throw "未找到托管壳输出目录：native-cs\src\SurveyController.App\bin\x64\$Configuration"
}

$backendOutput = Join-Path $appOutput 'SurveyController.Backend.exe'
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

if ($Action -eq 'preview') {
    $previewExecutable = Join-Path $appOutput 'SurveyController.exe'
    if (-not (Test-Path -LiteralPath $previewExecutable)) {
        throw "未找到原生预览程序：$previewExecutable"
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

$binRoot = Split-Path -Parent $packageRoot
$resolvedBinRoot = [System.IO.Path]::GetFullPath($binRoot)
$resolvedPackageRoot = [System.IO.Path]::GetFullPath($packageRoot)
if (-not $resolvedPackageRoot.StartsWith($resolvedBinRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "打包目录超出 bin：$resolvedPackageRoot"
}
if (Test-Path -LiteralPath $resolvedPackageRoot) {
    Remove-Item -LiteralPath $resolvedPackageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $resolvedPackageRoot -Force | Out-Null

$excludedExtensions = @('.pdb')
$excludedNames = @(
    'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Core.winmd',
    'SurveyController.pdb', 'createdump.exe'
)
Get-ChildItem -LiteralPath $appOutput -Recurse -File |
    Where-Object {
        $excludedExtensions -notcontains $_.Extension.ToLowerInvariant() -and
        $excludedNames -notcontains $_.Name
    } |
    ForEach-Object {
        $relativePath = [System.IO.Path]::GetRelativePath($appOutput, $_.FullName)
        $destination = Join-Path $resolvedPackageRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }

$configText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.yml') -Raw
$versionMatch = [regex]::Match($configText, '(?m)^\s+version:\s*["'']?([^"''#\r\n]+)')
if (-not $versionMatch.Success) {
    throw 'build/config.yml 缺少 info.version。'
}
$version = $versionMatch.Groups[1].Value.Trim()
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) {
    throw '未找到 NSIS makensis。'
}
if (-not (Test-Path -LiteralPath $installerIcon)) {
    throw "未找到安装程序图标：$installerIcon"
}

& $makensis `
    '/INPUTCHARSET' `
    'UTF8' `
    '-DINFO_COMPANYNAME=HUNGRY_M0' `
    '-DINFO_PRODUCTNAME=SurveyController' `
    "-DINFO_PRODUCTVERSION=$version" `
    '-DINFO_COPYRIGHT=(c) 2026, HUNGRY_M0' `
    "-DARG_NATIVE_PAYLOAD=$resolvedPackageRoot" `
    "-DARG_INSTALLER_OUTPUT=$installerOutput" `
    "-DARG_INSTALLER_ICON=$installerIcon" `
    (Join-Path $desktopRoot 'build\windows\nsis\project.nsi')
exit $LASTEXITCODE
