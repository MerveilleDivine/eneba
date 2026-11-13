param([ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$clusterRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.local\postgres'))
if (-not $clusterRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Local PostgreSQL path must stay inside this checkout.'
}
$pgBin = if ($env:ENEBA_POSTGRES_BIN) { $env:ENEBA_POSTGRES_BIN } else { Join-Path $env:ProgramFiles 'PostgreSQL\18\bin' }
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$initDb = Join-Path $pgBin 'initdb.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'PostgreSQL 18 binaries are required. Set ENEBA_POSTGRES_BIN if installed elsewhere.' }
$dataRoot = Join-Path $clusterRoot 'data'
$adminFile = Join-Path $projectRoot '.env.bootstrap.local'

if ($Action -eq 'Start' -and -not (Test-Path -LiteralPath (Join-Path $dataRoot 'PG_VERSION'))) {
  if (Test-Path -LiteralPath $adminFile) {
    $existingPassword = Get-Content -LiteralPath $adminFile | Where-Object { $_ -match '^PGPASSWORD=' -and $_ -notmatch '^PGPASSWORD=(("")|('''')|)\s*$' }
    if ($existingPassword) { throw 'Administrator credentials already exist. Keep them, or archive that local file before initializing a separate cluster.' }
  }
  [System.IO.Directory]::CreateDirectory($clusterRoot) | Out-Null
  $randomBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
  $password = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $passwordFile = Join-Path $clusterRoot 'init-password'
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($passwordFile, $password, $utf8)
  $adminLines = @(
    '# Project-owned PostgreSQL 18 cluster. Generated locally; never commit.',
    'PGHOST=127.0.0.1', 'PGPORT=5433', 'PGUSER=eneba_local_admin',
    'PGDATABASE=postgres', ('PGPASSWORD=' + $password), 'PGSSLMODE=disable'
  )
  [System.IO.File]::WriteAllLines($adminFile, $adminLines, $utf8)
  try {
    & $initDb -D $dataRoot -U eneba_local_admin --pwfile=$passwordFile --auth-host=scram-sha-256 --auth-local=scram-sha-256 -E UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'Local cluster initialization failed. Inspect .local\postgres before retrying.' }
  } finally {
    Remove-Item -LiteralPath $passwordFile -Force
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $dataRoot 'PG_VERSION'))) { throw 'Project cluster is not initialized. Run the Start action first.' }
if ($Action -eq 'Status') {
  & $pgCtl -D $dataRoot status
  exit $LASTEXITCODE
}
if ($Action -eq 'Stop') {
  & $pgCtl -D $dataRoot stop -m fast -w -t 30
  exit $LASTEXITCODE
}
& $pgCtl -D $dataRoot status *> $null
if ($LASTEXITCODE -eq 0) { Write-Host 'Project PostgreSQL is already running on port 5433.'; exit 0 }
# Start-Process separates the daemon from npm/test process jobs. Wait only for
# pg_ctl, not for the database process that is meant to remain running.
$startArguments = @('-D', ('"' + $dataRoot + '"'), '-l', ('"' + (Join-Path $clusterRoot 'postgres.log') + '"'), '-o', '"-h 127.0.0.1 -p 5433"', 'start', '-w', '-t', '30')
$launcher = Start-Process -FilePath $pgCtl -ArgumentList $startArguments -WindowStyle Hidden -PassThru
if (-not $launcher.WaitForExit(35000)) { throw 'PostgreSQL startup timed out; inspect .local\postgres\postgres.log.' }
$launcher.Refresh()
if ($launcher.ExitCode -ne 0) { throw 'PostgreSQL could not start; inspect .local\postgres\postgres.log.' }
Write-Host 'Project PostgreSQL is running on port 5433.'
exit 0
