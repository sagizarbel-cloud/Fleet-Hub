# Installs (or updates) Fleet Hub for this Windows user. Run by "Install Fleet Hub.cmd".
# No admin rights, internet or Docker needed. Installing again over an existing install keeps
# all data and logins, and only replaces the site itself.
param([string]$AdminEmail = '', [string]$AdminName = '', [switch]$NoBrowser)

$here = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common.ps1')

function Step([string]$text) { Write-Host ''; Write-Host "  $text" -ForegroundColor Yellow }
function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b)
}

try {
  Write-Host ''
  Write-Host '  Fleet Hub - Windows install' -ForegroundColor Cyan
  Write-Host "  Installing to $FH"

  if ([Environment]::Is64BitOperatingSystem -eq $false) { throw 'Fleet Hub needs 64-bit Windows.' }
  $sys = Join-Path $env:SystemRoot 'System32'
  if (-not ((Test-Path "$sys\vcruntime140.dll") -and (Test-Path "$sys\msvcp140.dll"))) {
    Start-Process 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
    throw ("This computer is missing the Microsoft Visual C++ Runtime, which the database needs.`n" +
      "Its installer (vc_redist.x64.exe, from Microsoft) is downloading in your browser now: run it, then run this install again.")
  }

  $fresh = -not (Test-Path -LiteralPath (Join-Path $PgData 'PG_VERSION'))

  Step '1/5  Copying the site'
  if ((Resolve-Path -LiteralPath $here).Path.TrimEnd('\') -ieq $FH.TrimEnd('\')) { throw 'Run the install from the downloaded files, not from the installed folder.' }
  if (Test-Path -LiteralPath $Node) { Stop-Site; Stop-Database }
  New-Item -ItemType Directory -Force -Path $FH | Out-Null
  foreach ($part in 'app', 'runtime', 'tools') {
    $target = Join-Path $FH $part
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    # The setup folder is on the same drive, so this is a quick move, not a copy.
    Move-Item -LiteralPath (Join-Path $here $part) -Destination $target -Force
  }
  # Re-load the helpers from their installed place (this script's own folder just moved).
  . (Join-Path $FH 'tools\common.ps1')
  New-Item -ItemType Directory -Force -Path $Data, $Uploads, $Logs | Out-Null

  Step '2/5  Settings and secrets'
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    $dbPassword = (New-Secret 24) -replace '[^A-Za-z0-9]', ''
    $lines = @(
      '# Fleet Hub settings on this computer. Keep this file private: it holds the keys that',
      '# protect sessions and start codes. Losing FLEET_CODE_KEY makes saved start codes unreadable.',
      'NODE_ENV=production',
      'LOG_LEVEL=warn',
      "DATABASE_URL=postgresql://fleethub:$dbPassword@127.0.0.1:$PgPort/fleethub",
      'API_HOST=127.0.0.1',
      "API_PORT=$SitePort",
      "APP_ORIGIN=$SiteUrl",
      "SESSION_SECRET=$(New-Secret 32)",
      "FLEET_CODE_KEY=$(New-Secret 32)",
      "UPLOAD_DIR=$Uploads",
      'UPLOAD_MAX_MB=20',
      "WEB_DIR=$(Join-Path $FH 'app\web')",
      "PG_PASSWORD=$dbPassword"
    )
    Set-Content -LiteralPath $EnvFile -Value $lines -Encoding ASCII
  } else {
    # Older installs: make sure the site serves its pages from the current place.
    $vars = Read-FleetEnv
    if (-not $vars.ContainsKey('WEB_DIR')) { Add-Content -LiteralPath $EnvFile -Value "WEB_DIR=$(Join-Path $FH 'app\web')" }
  }
  $vars = Read-FleetEnv

  Step '3/5  Database'
  if ($fresh) {
    if (Test-Path -LiteralPath $PgData) { Remove-Item -LiteralPath $PgData -Recurse -Force }
    $pw = Join-Path $Data 'pw.tmp'
    Set-Content -LiteralPath $pw -Value $vars['PG_PASSWORD'] -Encoding ASCII -NoNewline
    try {
      $code = Invoke-Hidden (Join-Path $PgBin 'initdb.exe') @('-D', $PgData, '-U', 'fleethub', "--pwfile=$pw",
        '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale') 300
    } finally { Remove-Item -LiteralPath $pw -Force -ErrorAction SilentlyContinue }
    if ($code -ne 0) { throw 'Setting up the database failed (initdb).' }
    Add-Content -LiteralPath (Join-Path $PgData 'postgresql.conf') -Value @(
      '', '# Fleet Hub: only this computer can reach the database.',
      "listen_addresses = '127.0.0.1'", "port = $PgPort"
    )
  }
  Start-Database
  Update-DatabaseSchema

  Step '4/5  Shortcuts'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Fleet Hub'
  New-Item -ItemType Directory -Force -Path $menu | Out-Null
  New-Shortcut (Join-Path $desktop 'Fleet Hub.lnk') 'start.ps1' '' 'Start Fleet Hub and open it'
  New-Shortcut (Join-Path $menu 'Fleet Hub.lnk') 'start.ps1' '' 'Start Fleet Hub and open it'
  New-Shortcut (Join-Path $menu 'Stop Fleet Hub.lnk') 'stop.ps1' '' 'Stop Fleet Hub'
  New-Shortcut (Join-Path $menu 'Back up Fleet Hub.lnk') 'backup.ps1' '' 'Save a copy of all Fleet Hub data'
  # Starts quietly at sign-in, so the site is there whenever the laptop is on.
  New-Shortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'Fleet Hub.lnk') 'start.ps1' '-NoBrowser' 'Start Fleet Hub at sign-in'

  Step '5/5  Starting the site'
  Start-Site

  $link = $null
  $first = (Invoke-Native { & $Node -e "const{PrismaClient}=require(process.argv[1]);const d=new PrismaClient();d.user.count({where:{role:'ADMIN'}}).then(n=>{console.log(n);return d.`$disconnect()})" (Join-Path $Api 'node_modules\@prisma\client') }) -eq '0'
  if ($first) {
    Write-Host ''
    Write-Host '  Now the first admin account (you). You choose its password in the browser next.' -ForegroundColor Cyan
    while (-not $AdminEmail) { $AdminEmail = (Read-Host '  Your email').Trim() }
    while (-not $AdminName) { $AdminName = (Read-Host '  Your name').Trim() }
    Push-Location $Api
    try {
      $output = Invoke-Native { & $Node "--env-file=$EnvFile" 'dist\create-admin.js' --email $AdminEmail --name $AdminName 2>&1 }
    } finally { Pop-Location }
    $output | ForEach-Object { Write-Host "  $_" }
    $link = $output | ForEach-Object { "$_" } | Where-Object { $_ -like "$SiteUrl/*" } | Select-Object -Last 1
    if (-not $link) { throw 'Creating the admin account failed. Run the install again to retry.' }
  }

  Write-Host ''
  Write-Host "  Done. Fleet Hub is running at $SiteUrl" -ForegroundColor Green
  Write-Host '  Use the "Fleet Hub" icon on the desktop to open it. Your data stays in:'
  Write-Host "  $Data"
  if (-not $NoBrowser) { Start-Process ($(if ($link) { $link } else { $SiteUrl })) }
  if ($link) {
    Write-Host ''
    Write-Host '  Your browser is opening a page to choose your password. If it does not, open:'
    Write-Host "  $link"
  }
  exit 0
} catch {
  Write-Host ''
  Write-Host "  The install stopped: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Logs are in $Logs"
  exit 1
}
