# The "Stop Fleet Hub" shortcut: stops the site and the database. Nothing is lost.
param([switch]$Quiet)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
  Stop-Site
  Stop-Database
  if (-not $Quiet) { Show-Message 'Fleet Hub is stopped. The "Fleet Hub" icon starts it again.' }
} catch {
  if (-not $Quiet) { Show-Message "Stopping Fleet Hub failed.`n`n$($_.Exception.Message)" 'Fleet Hub' 'Error' }
  exit 1
}
