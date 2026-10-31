$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$existingData = Join-Path $projectRoot '.phase00-postgres'
$databaseData = if (Test-Path -LiteralPath (Join-Path $existingData 'PG_VERSION')) { $existingData } else { Join-Path $projectRoot '.local/postgres' }
$databaseData = [IO.Path]::GetFullPath($databaseData)
if (-not $databaseData.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Database directory is outside the project' }
$pgBin = if (Get-Command pg_ctl -ErrorAction SilentlyContinue) { Split-Path (Get-Command pg_ctl).Source } else { Join-Path $env:ProgramFiles 'PostgreSQL/17/bin' }
if (-not (Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) { throw 'PostgreSQL 17 tools are required' }
if (-not (Test-Path -LiteralPath (Join-Path $databaseData 'PG_VERSION'))) {
    New-Item -ItemType Directory -Path (Split-Path $databaseData) -Force | Out-Null
    & (Join-Path $pgBin 'initdb.exe') -D $databaseData -U postgres -A trust --no-locale -E UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL initialization failed' }
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $databaseData status *> $null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $pgBin 'pg_ctl.exe') -D $databaseData -l (Join-Path $databaseData 'server.log') -o '-p 55432 -h 127.0.0.1' -w start
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start project PostgreSQL on 127.0.0.1:55432; existing services were not stopped' }
}
npm ci --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm run local:bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Local bootstrap failed' }
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
npm run dev
