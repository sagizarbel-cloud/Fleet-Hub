# The "Fleet Hub" shortcut: starts the database and the site if they aren't running, then opens
# the site. At sign-in it runs with -NoBrowser.
param([switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
  if (-not (Test-Site)) {
    Start-Database
    Update-DatabaseSchema
    Start-Site
  }
  if (-not $NoBrowser) { Start-Process $SiteUrl }
} catch {
  if (-not $NoBrowser) { Show-Message "Fleet Hub didn't start.`n`n$($_.Exception.Message)" 'Fleet Hub' 'Error' }
  exit 1
}
