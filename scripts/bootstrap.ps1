$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$downloadRoot = Join-Path $toolsRoot 'downloads'
[System.IO.Directory]::CreateDirectory($downloadRoot) | Out-Null

function Install-VerifiedArchive {
  param([string]$Uri, [string]$Sha256, [string]$ArchiveName, [string]$Destination, [string]$Executable, [string[]]$IncludePrefixes = @(), [string]$CompletionMarker)
  if ((Test-Path -LiteralPath $Executable) -and (-not $CompletionMarker -or (Test-Path -LiteralPath $CompletionMarker))) { return }
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
  if ($IncludePrefixes.Count -eq 0) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $Destination -Force
  } else {
    # The EDB archive also bundles GUI applications. Install only runtime/CLI
    # directories, and mark completion only after every selected file is written.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
      $destinationPrefix = [System.IO.Path]::GetFullPath($Destination) + [System.IO.Path]::DirectorySeparatorChar
      foreach ($entry in $archive.Entries) {
        if (-not $entry.Name) { continue }
        $included = @($IncludePrefixes | Where-Object { $entry.FullName.StartsWith($_, [System.StringComparison]::Ordinal) }).Count -gt 0
        if (-not $included -and $entry.FullName -ne 'pgsql/server_license.txt' -and $entry.FullName -ne 'pgsql/commandlinetools_3rd_party_licenses.txt') { continue }
        $target = [System.IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
        if (-not $target.StartsWith($destinationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive target escapes its tools directory.' }
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
      }
    } finally { $archive.Dispose() }
  }
  if (-not (Test-Path -LiteralPath $Executable)) { throw "Archive is missing its expected executable." }
  if ($CompletionMarker) { [System.IO.File]::WriteAllText($CompletionMarker, $Sha256) }
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
$postgresVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.postgres-version') -Raw).Trim()
$postgresName = "postgresql-$postgresVersion-1-windows-x64-binaries.zip"
$postgresRoot = Join-Path $toolsRoot "postgresql-$postgresVersion"
# Supplier checksum: https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip.sha256
$postgresHash = 'ead0bbc27fb678fa24dcf86b738981323042abd073c744103bf7f3aed23f9a33'
Install-VerifiedArchive -Uri "https://get.enterprisedb.com/postgresql/$postgresName" -Sha256 $postgresHash -ArchiveName $postgresName -Destination $postgresRoot -Executable (Join-Path $postgresRoot 'pgsql\bin\postgres.exe') -IncludePrefixes @('pgsql/bin/', 'pgsql/lib/', 'pgsql/share/') -CompletionMarker (Join-Path $postgresRoot '.complete')
. (Join-Path $PSScriptRoot 'environment.ps1')
& $goExecutable version
& $nodeExecutable --version
& (Join-Path $postgresRoot 'pgsql\bin\postgres.exe') --version
Write-Host 'Toolchain ready. In a new terminal, run: . .\scripts\environment.ps1'
