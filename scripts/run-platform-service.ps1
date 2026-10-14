$ErrorActionPreference='Stop'
$jarvisWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$jarvisNode = (Get-Command node -ErrorAction Stop).Source
Set-Location -LiteralPath $jarvisWorkspace
& $jarvisNode (Join-Path $PSScriptRoot 'platform-service.mjs') run
exit $LASTEXITCODE
