# ashuflow Extension (Chrome, Edge, Brave, Opera, Vivaldi, Firefox)

Adds a **⬇ Download (ashuflow)** button right below every YouTube video.
Pick **MP3** (320 / 192 / 128 kbps) or **Video** (1080p / 720p / 480p MP4).
Songs (MP3) are saved to `Downloads\ashuflow\Songs`, videos (MP4) to `Downloads\ashuflow\Videos`.
After a download, click **📂 Show in Songs / Videos** to open that folder with the file selected.

The extension hands the URL to a small local helper that uses **yt-dlp** + **ffmpeg**
(a browser extension can't download and convert by itself, so the helper is required).

## Setup (once)

1. Double-click **`SETUP.bat`**. It installs Python, yt-dlp and ffmpeg if missing and
   connects the helper to all supported browsers.
2. Add the extension:
   - **Chrome / Edge / Brave / Opera / Vivaldi:** open the extensions page
     (`chrome://extensions`, `edge://extensions`, ...), turn on **Developer mode**,
     click **Load unpacked**, choose the `extension` folder.
     If it was already loaded, click the **reload** icon on its card.
   - **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
     pick `extension\manifest.json`. (Firefox removes temporary add-ons on restart.)
3. Restart the browser.

## Use

Open a YouTube video → click **⬇ Download (ashuflow)** under the player → choose MP3 or Video.
The toolbar icon popup works too.

Don't move the folder after setup (re-run `SETUP.bat` if you do). If downloads start
failing after a YouTube change, re-run `SETUP.bat` to update yt-dlp.

Use it only for content you have the right to download (your own uploads,
Creative Commons, public domain). Downloading may violate YouTube's Terms of Service.
