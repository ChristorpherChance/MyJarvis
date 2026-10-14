$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath 'node_modules')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
}
if (-not (Test-Path -LiteralPath 'apps/web/dist/index.html')) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw '构建失败' }
}
& npm.cmd start
