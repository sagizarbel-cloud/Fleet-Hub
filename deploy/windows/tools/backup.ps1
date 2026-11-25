# The "Back up Fleet Hub" shortcut: stops Fleet Hub for a moment and saves a copy of all its data
# (database, uploaded files, settings and keys) as one zip in Documents\Fleet Hub backups.
# To restore: stop Fleet Hub, then run tools\restore.ps1 with the zip (see docs/WINDOWS.md).
param([switch]$Quiet)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
  $folder = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Fleet Hub backups'
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $zip = Join-Path $folder ("fleethub-" + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.zip')
  $wasRunning = Test-Site
  Stop-Site
  Stop-Database
  try {
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    Push-Location $Data
    try {
      $code = Invoke-Hidden $tar @('-a', '-c', '-f', $zip, 'pgdata', 'uploads', 'fleethub.env') 1800
    } finally { Pop-Location }
    if ($code -ne 0) { throw 'Writing the backup zip failed.' }
  } finally {
    if ($wasRunning) { Start-Database; Start-Site }
  }
  if (-not $Quiet) { Show-Message "Backup saved:`n$zip`n`nKeep a copy off this laptop too (a USB stick or cloud drive)." }
} catch {
  if (-not $Quiet) { Show-Message "The backup failed.`n`n$($_.Exception.Message)" 'Fleet Hub' 'Error' }
  exit 1
}
