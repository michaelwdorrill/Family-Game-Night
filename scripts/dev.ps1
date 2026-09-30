$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$env:COREPACK_HOME = Join-Path $ProjectRoot '.corepack'
$env:npm_config_cache = Join-Path $ProjectRoot '.npm-cache'
$CorepackBin = Join-Path $env:COREPACK_HOME 'bin'

New-Item -ItemType Directory -Force -Path $CorepackBin | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $CorepackBin 'pnpm.CMD'))) {
  corepack enable --install-directory $CorepackBin
}

$env:Path = "$CorepackBin;$env:Path"
pnpm install --frozen-lockfile
pnpm --filter '@family-game-night/worker' db:migrate:local
pnpm dev
