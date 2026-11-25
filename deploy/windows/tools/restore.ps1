# Puts back a backup made by "Back up Fleet Hub". Everything since that backup is replaced, so
# the current data is first saved aside as data-before-restore-<time>.
param([Parameter(Mandatory = $true)][string]$Backup)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
  $Backup = (Resolve-Path -LiteralPath $Backup).Path
  Stop-Site
  Stop-Database
  $aside = Join-Path $FH ('data-before-restore-' + (Get-Date -Format 'yyyy-MM-dd-HHmm'))
  if (Test-Path -LiteralPath $Data) { Move-Item -LiteralPath $Data -Destination $aside }
  New-Item -ItemType Directory -Force -Path $Data, $Logs | Out-Null
  $code = Invoke-Hidden (Join-Path $env:SystemRoot 'System32\tar.exe') @('-x', '-f', $Backup, '-C', $Data) 1800
  if ($code -ne 0) { throw 'Reading the backup zip failed.' }
  New-Item -ItemType Directory -Force -Path $Uploads | Out-Null
  Start-Database
  Update-DatabaseSchema
  Start-Site
  Write-Host "Restored. The data from before is kept in $aside"
} catch {
  Write-Host "The restore stopped: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
