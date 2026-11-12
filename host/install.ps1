# Installs dependencies (Python, yt-dlp, ffmpeg) and registers the helper with every supported browser.
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$ChromeId = "ladlfdmmgoahjebfegejgefaidnjmfbp"   # fixed by the "key" in extension/manifest.json
$FirefoxId = "ytmp3@local"
$hostName = "com.ytmp3.host"

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

# 1. Python
if (-not (Have "python")) {
    Write-Host "Installing Python..."
    winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
    Refresh-Path
}
if (-not (Have "python")) { throw "Python is still not on PATH. Install it from python.org (tick 'Add to PATH') and re-run setup." }

# 2. yt-dlp
Write-Host "Installing/updating yt-dlp..."
python -m pip install --user --upgrade --quiet yt-dlp

# 3. ffmpeg
if (-not (Have "ffmpeg")) {
    Write-Host "Installing ffmpeg..."
    winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    Refresh-Path
}

# 4. Native host manifests (Chromium-family and Firefox use different formats)
$bat = Join-Path $dir "host.bat"
$chromeManifest = Join-Path $dir "$hostName.chrome.json"
$firefoxManifest = Join-Path $dir "$hostName.firefox.json"

$base = @{ name = $hostName; description = "SAFlow Extension helper"; path = $bat; type = "stdio" }
$c = $base.Clone(); $c.allowed_origins = @("chrome-extension://$ChromeId/")
$f = $base.Clone(); $f.allowed_extensions = @($FirefoxId)
[IO.File]::WriteAllText($chromeManifest, ($c | ConvertTo-Json))
[IO.File]::WriteAllText($firefoxManifest, ($f | ConvertTo-Json))

$keys = @{
    "Google\Chrome"                  = $chromeManifest
    "Microsoft\Edge"                 = $chromeManifest
    "BraveSoftware\Brave-Browser"    = $chromeManifest
    "Chromium"                       = $chromeManifest
    "Vivaldi"                        = $chromeManifest
    "Opera Software"                 = $chromeManifest
    "Mozilla"                        = $firefoxManifest
}
foreach ($k in $keys.Keys) {
    $path = "HKCU:\Software\$k\NativeMessagingHosts\$hostName"
    New-Item -Path $path -Force | Out-Null
    Set-ItemProperty -Path $path -Name "(default)" -Value $keys[$k]
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
if (-not (Have "ffmpeg")) { Write-Warning "ffmpeg isn't on PATH yet - restart your PC if downloads fail with an ffmpeg error." }
