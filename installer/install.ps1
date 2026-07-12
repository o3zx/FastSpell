# FastSpell installer
# Copies the bundled Vencord+FastSpell build to %APPDATA%\FastSpell and patches
# every Discord installation (stable / PTB / Canary) to load it.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  FastSpell installer" -ForegroundColor Cyan
Write-Host "  -------------------"
Write-Host ""

$distSource = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path (Join-Path $distSource "patcher.js"))) {
    Write-Host "  Can't find the dist folder next to this script." -ForegroundColor Red
    Write-Host "  Make sure you extracted the whole zip, then run install.ps1 from inside that folder."
    Read-Host "  Press Enter to close"
    exit 1
}

# close discord if it's running
$running = Get-Process -Name Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "  Closing Discord..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# copy the build
$appDir = Join-Path $env:APPDATA "FastSpell"
$distDir = Join-Path $appDir "dist"
New-Item -ItemType Directory -Force $distDir | Out-Null
Copy-Item -Force "$distSource\*" $distDir
Write-Host "  Copied files to $appDir"

$patcherPath = (Join-Path $distDir "patcher.js") -replace "\\", "/"

# patch every discord install we can find
$patched = 0
foreach ($branch in "Discord", "DiscordPTB", "DiscordCanary") {
    $base = Join-Path $env:LOCALAPPDATA $branch
    if (-not (Test-Path $base)) { continue }

    foreach ($app in Get-ChildItem $base -Directory -Filter "app-*") {
        $res = Join-Path $app.FullName "resources"
        $asar = Join-Path $res "app.asar"
        if (-not (Test-Path $asar)) { continue }

        if (-not (Get-Item $asar).PSIsContainer) {
            # first time: keep the original asar and take its place
            Rename-Item $asar (Join-Path $res "_app.asar")
            New-Item -ItemType Directory $asar | Out-Null
        }

        Set-Content -Path (Join-Path $asar "package.json") -Value '{"name":"discord","main":"index.js"}' -Encoding ascii
        Set-Content -Path (Join-Path $asar "index.js") -Value "require(`"$patcherPath`");" -Encoding ascii

        Write-Host "  Patched $branch $($app.Name)" -ForegroundColor Green
        $patched++
    }
}

Write-Host ""
if ($patched -eq 0) {
    Write-Host "  Couldn't find any Discord installation to patch." -ForegroundColor Red
    Write-Host "  FastSpell needs the normal desktop Discord from discord.com."
} else {
    Write-Host "  Done!" -ForegroundColor Green
    Write-Host "  Start Discord, then go to Settings > Vencord > Plugins and enable FastSpell."
    Write-Host "  For voice typing, add a free Groq API key (console.groq.com/keys) in the plugin settings."
}
Write-Host ""
Read-Host "  Press Enter to close"
