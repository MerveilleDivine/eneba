$projectRoot = Split-Path -Parent $PSScriptRoot
$goVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.go-version') -Raw).Trim()
$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$goBin = Join-Path $projectRoot ".tools\go$goVersion\go\bin"
$nodeBin = Join-Path $projectRoot ".tools\node-v$nodeVersion-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $goBin 'go.exe'))) { throw 'Run scripts\bootstrap.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $nodeBin 'node.exe'))) { throw 'Run scripts\bootstrap.ps1 first.' }
$env:PATH = "$nodeBin;$goBin;$env:PATH"
$postgresBin = Join-Path $env:ProgramFiles 'PostgreSQL\18\bin'
if (Test-Path -LiteralPath $postgresBin) { $env:PATH = "$env:PATH;$postgresBin" }
$env:GOCACHE = Join-Path $projectRoot '.cache\go-build'
$env:GOMODCACHE = Join-Path $projectRoot '.cache\go-mod'
$env:GOPATH = Join-Path $projectRoot '.cache\go'
$env:GOTOOLCHAIN = 'local'
# Use the Windows resolver; the pure Go resolver can miss system DNS routing.
if (-not $env:GODEBUG) { $env:GODEBUG = 'netdns=cgo' }
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$env:NODE_USE_SYSTEM_CA = '1'
# Respect a Windows system proxy without storing its address in the repository.
if (-not $env:HTTPS_PROXY) {
  $probeUri = [uri]'https://registry.npmjs.org'
  $proxyUri = [System.Net.WebRequest]::DefaultWebProxy.GetProxy($probeUri)
  if ($proxyUri -and $proxyUri.AbsoluteUri -ne $probeUri.AbsoluteUri) {
    $env:HTTPS_PROXY = $proxyUri.AbsoluteUri
    $env:HTTP_PROXY = $proxyUri.AbsoluteUri
  }
}
if (-not $env:NO_PROXY) { $env:NO_PROXY = 'localhost,127.0.0.1,::1' }
