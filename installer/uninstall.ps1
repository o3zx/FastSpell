# FastSpell uninstaller
# Restores the original Discord files and removes the FastSpell build.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  FastSpell uninstaller" -ForegroundColor Cyan
Write-Host "  ---------------------"
Write-Host ""

$running = Get-Process -Name Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "  Closing Discord..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

$restored = 0
foreach ($branch in "Discord", "DiscordPTB", "DiscordCanary") {
    $base = Join-Path $env:LOCALAPPDATA $branch
    if (-not (Test-Path $base)) { continue }

    foreach ($app in Get-ChildItem $base -Directory -Filter "app-*") {
        $res = Join-Path $app.FullName "resources"
        $asar = Join-Path $res "app.asar"
        $backup = Join-Path $res "_app.asar"

        if ((Test-Path $asar) -and (Get-Item $asar).PSIsContainer -and (Test-Path $backup)) {
            Remove-Item -Recurse -Force $asar
            Rename-Item $backup "app.asar"
            Write-Host "  Restored $branch $($app.Name)" -ForegroundColor Green
            $restored++
        }
    }
}

$appDir = Join-Path $env:APPDATA "FastSpell"
if (Test-Path $appDir) {
    Remove-Item -Recurse -Force $appDir
    Write-Host "  Removed $appDir"
}

Write-Host ""
if ($restored -eq 0) {
    Write-Host "  Nothing to restore — Discord doesn't seem to be patched."
} else {
    Write-Host "  Done, Discord is back to normal." -ForegroundColor Green
}
Write-Host ""
Read-Host "  Press Enter to close"
