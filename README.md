# ashuflow Extension (Chrome, Edge, Brave, Opera, Vivaldi, Firefox)

**Developed by Ashu**

Adds a **⬇ download button to the YouTube player controls**, right next to **CC**.
Pick **MP3** (320 / 192 / 128 kbps) or **Video** (1080p / 720p / 480p MP4).

- Songs (MP3) are saved to `Downloads\ashuflow\Songs`
- Videos (MP4) are saved to `Downloads\ashuflow\Videos`

Progress shows as a ring around the button and a panel inside the player; when it's
done, click **📂 Show in Songs / Videos** to open the folder with the file selected.

The extension hands the URL to a small local helper that uses **yt-dlp** + **ffmpeg**
(a browser extension can't download and convert by itself, so the helper is required).

## Setup (once)

1. Double-click **`SETUP.bat`**. It installs Python, yt-dlp and ffmpeg if missing and
   connects the helper to all supported browsers.
2. Add the extension:
   - **Chrome / Edge / Brave / Opera / Vivaldi:** open the extensions page
     (`chrome://extensions`, `edge://extensions`, ...), turn on **Developer mode**,
     click **Load unpacked**, choose the `extension` folder.
   - **Firefox:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
     pick `extension\manifest.json`. (Firefox removes temporary add-ons on restart.)
3. Restart the browser.

## Use

Open a YouTube video → click **⬇** in the player controls (next to CC) → choose MP3 or Video.

## Updates

The extension checks GitHub for a newer version when the browser starts and every 6 hours.
When one is available, the toolbar icon shows a **NEW** badge: open the toolbar menu and
click **⬆ Update now**. It downloads the latest code, updates yt-dlp, and reloads itself.
You can also click **Check for updates** in the toolbar menu at any time.

Don't move the folder after setup (re-run `SETUP.bat` if you do).

Use it only for content you have the right to download (your own uploads,
Creative Commons, public domain). Downloading may violate YouTube's Terms of Service.

## License

[MIT](LICENSE) © 2026 Ashu
