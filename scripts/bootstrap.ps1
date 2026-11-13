$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$downloadRoot = Join-Path $toolsRoot 'downloads'
[System.IO.Directory]::CreateDirectory($downloadRoot) | Out-Null

function Install-VerifiedArchive {
  param([string]$Uri, [string]$Sha256, [string]$ArchiveName, [string]$Destination, [string]$Executable)
  if (Test-Path -LiteralPath $Executable) { return }
  $archivePath = Join-Path $downloadRoot $ArchiveName
  if (-not (Test-Path -LiteralPath $archivePath)) {
    Write-Host "Downloading $ArchiveName"
    Invoke-WebRequest -Uri $Uri -UseBasicParsing -OutFile $archivePath
  }
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  if ($actualHash -ine $Sha256) {
    throw "Checksum mismatch for $ArchiveName. Remove that archive and retry."
  }
  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $Destination -Force
  if (-not (Test-Path -LiteralPath $Executable)) { throw "Archive is missing its expected executable." }
}

$goVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.go-version') -Raw).Trim()
$goName = "go$goVersion.windows-amd64.zip"
$goExecutable = Join-Path $toolsRoot "go$goVersion\go\bin\go.exe"
if (-not (Test-Path -LiteralPath $goExecutable)) {
  $releases = Invoke-RestMethod -Uri 'https://go.dev/dl/?mode=json&include=all'
  $goArchive = $releases | Where-Object { $_.version -eq "go$goVersion" } | ForEach-Object { $_.files } | Where-Object { $_.filename -eq $goName }
  if (-not $goArchive) { throw "Pinned Go release was not found in the official manifest." }
  Install-VerifiedArchive -Uri "https://go.dev/dl/$goName" -Sha256 $goArchive.sha256 -ArchiveName $goName -Destination (Join-Path $toolsRoot "go$goVersion") -Executable $goExecutable
}

$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$nodeName = "node-v$nodeVersion-win-x64.zip"
$nodeExecutable = Join-Path $toolsRoot "node-v$nodeVersion-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  $checksums = (Invoke-WebRequest -Uri "https://nodejs.org/download/release/v$nodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
  $checksumLine = $checksums -split '\r?\n' | Where-Object { $_.Trim().EndsWith(" $nodeName") }
  if (-not $checksumLine) { throw "Pinned Node release was not found in the official manifest." }
  $nodeHash = ($checksumLine.Trim() -split '\s+')[0]
  Install-VerifiedArchive -Uri "https://nodejs.org/download/release/v$nodeVersion/$nodeName" -Sha256 $nodeHash -ArchiveName $nodeName -Destination $toolsRoot -Executable $nodeExecutable
}
. (Join-Path $PSScriptRoot 'environment.ps1')
& $goExecutable version
& $nodeExecutable --version
Write-Host 'Toolchain ready. In a new terminal, run: . .\scripts\environment.ps1'
