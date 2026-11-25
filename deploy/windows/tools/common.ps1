# Shared by the Fleet Hub Windows scripts. Everything lives in %LOCALAPPDATA%\FleetHub:
#   app\      the site (replaced by each install)      runtime\  Node and PostgreSQL
#   tools\    these scripts                            data\     the database, uploads, logs, secrets
# Only data\ holds anything of yours; installing again never touches it.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$FH = Join-Path $env:LOCALAPPDATA 'FleetHub'
$Data = Join-Path $FH 'data'
$PgData = Join-Path $Data 'pgdata'
$Uploads = Join-Path $Data 'uploads'
$Logs = Join-Path $Data 'logs'
$EnvFile = Join-Path $Data 'fleethub.env'
$PidFile = Join-Path $Data 'site.pid'
$Node = Join-Path $FH 'runtime\node\node.exe'
$PgBin = Join-Path $FH 'runtime\pgsql\bin'
$Api = Join-Path $FH 'app\api'
$PgPort = 54329
$SitePort = 3001
$SiteUrl = "http://localhost:$SitePort"

function Read-FleetEnv {
  $vars = @{}
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2] }
  }
  return $vars
}

function Use-FleetEnv {
  $vars = Read-FleetEnv
  foreach ($k in $vars.Keys) { Set-Item -LiteralPath "env:$k" -Value $vars[$k] }
}

function Test-Site {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "$SiteUrl/api/health"
    return $r.StatusCode -eq 200
  } catch { return $false }
}

# Runs a program hidden and waits for it alone (pg_ctl leaves the database running behind it,
# which a pipe would wait on forever).
function Invoke-Hidden([string]$exe, [string[]]$argv, [int]$seconds = 120) {
  $quoted = $argv | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }
  $p = Start-Process -FilePath $exe -ArgumentList ($quoted -join ' ') -WindowStyle Hidden -PassThru
  if (-not $p.WaitForExit($seconds * 1000)) { throw "$([IO.Path]::GetFileName($exe)) took too long." }
  return $p.ExitCode
}

function Test-Database {
  if (-not (Test-Path -LiteralPath (Join-Path $PgData 'PG_VERSION'))) { return $false }
  return (Invoke-Hidden (Join-Path $PgBin 'pg_ctl.exe') @('status', '-D', $PgData) 20) -eq 0
}

function Start-Database {
  if (Test-Database) { return }
  New-Item -ItemType Directory -Force -Path $Logs | Out-Null
  $code = Invoke-Hidden (Join-Path $PgBin 'pg_ctl.exe') @('start', '-D', $PgData, '-l', (Join-Path $Logs 'postgres.log'), '-w', '-t', '90') 120
  if ($code -ne 0) { throw "The database didn't start. Details: $Logs\postgres.log" }
}

function Stop-Database {
  if (Test-Database) {
    Invoke-Hidden (Join-Path $PgBin 'pg_ctl.exe') @('stop', '-D', $PgData, '-m', 'fast', '-w', '-t', '60') 90 | Out-Null
  }
}

# Windows PowerShell turns a native program's stderr lines into errors, which 'Stop' would
# treat as fatal; programs here report failure by exit code instead.
function Invoke-Native([scriptblock]$block) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $block } finally { $ErrorActionPreference = $old }
}

# Brings the database up to this version of the site. Moves only forward; never deletes data.
function Update-DatabaseSchema {
  Use-FleetEnv
  $log = Join-Path $Logs 'migrate.log'
  Push-Location $Api
  try {
    Invoke-Native { & $Node 'node_modules\prisma\build\index.js' migrate deploy --schema 'prisma\schema.prisma' *> $log }
    if ($LASTEXITCODE -ne 0) { throw "Updating the database failed. Details: $log" }
  } finally { Pop-Location }
}

function Start-Site {
  if (Test-Site) { return }
  Use-FleetEnv
  New-Item -ItemType Directory -Force -Path $Logs | Out-Null
  # Through cmd (started by the shell, not inheriting this window's handles), so a caller that
  # reads this script's output isn't kept waiting for as long as the site runs.
  $line = "`"$Node`" `"--env-file=$EnvFile`" dist\server.js > `"$Logs\site.log`" 2> `"$Logs\site-errors.log`""
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') -ArgumentList "/d /s /c `"$line`"" `
    -WorkingDirectory $Api -WindowStyle Hidden
  $p = $null
  for ($i = 0; $i -lt 20 -and -not $p; $i++) {
    Start-Sleep -Milliseconds 250
    $p = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Node } | Select-Object -First 1
  }
  if (-not $p) { throw "The site didn't start. Details: $Logs\site-errors.log" }
  Set-Content -LiteralPath $PidFile -Value $p.Id
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-Site) { return }
    if ($p.HasExited) { break }
    Start-Sleep -Seconds 1
  }
  throw "The site didn't start. Details: $Logs\site-errors.log"
}

function Stop-Site {
  if (Test-Path -LiteralPath $PidFile) {
    $id = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.Path -eq $Node) { Stop-Process -Id $id -Force }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }
  # A site started some other way (or whose pid file was lost).
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Node } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function New-Shortcut([string]$path, [string]$script, [string]$extra = '', [string]$description = '') {
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $FH "tools\$script")`" $extra".Trim()
  $s.WorkingDirectory = $FH
  $s.WindowStyle = 7
  $s.Description = $description
  $icon = Join-Path $FH 'tools\fleethub.ico'
  if (Test-Path -LiteralPath $icon) { $s.IconLocation = $icon }
  $s.Save()
}

function Show-Message([string]$text, [string]$title = 'Fleet Hub', [string]$kind = 'Information') {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', $kind) | Out-Null
}
