"""SAFlow native messaging host: downloads a YouTube URL as MP3 or MP4 via yt-dlp + ffmpeg."""
import json
import os
import re
import shutil
import struct
import sys
from pathlib import Path

ALLOWED = re.compile(r"^https://(www\.|m\.)?(youtube\.com|youtu\.be)/", re.I)
OUT_DIR = Path.home() / "Downloads" / "SAFlow"
SONG_DIR = OUT_DIR / "Songs"    # MP3s
VIDEO_DIR = OUT_DIR / "Videos"  # MP4s


def send(msg):
    data = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack("<I", raw)[0]
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


class QuietLogger:
    # stdout is the messaging channel, so yt-dlp must never print to it
    def debug(self, m): pass
    def info(self, m): pass
    def warning(self, m): pass
    def error(self, m): print(m, file=sys.stderr)


def find_ffmpeg():
    """Locate ffmpeg even when the browser was started before ffmpeg was added to PATH."""
    found = shutil.which("ffmpeg")
    if found:
        return str(Path(found).parent)
    # Re-read PATH from the registry (browser may hold a stale copy)
    if sys.platform == "win32":
        try:
            import winreg
            parts = []
            for root, sub in ((winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
                              (winreg.HKEY_CURRENT_USER, "Environment")):
                try:
                    with winreg.OpenKey(root, sub) as k:
                        parts.append(os.path.expandvars(winreg.QueryValueEx(k, "Path")[0]))
                except OSError:
                    pass
            found = shutil.which("ffmpeg", path=os.pathsep.join(parts))
            if found:
                return str(Path(found).parent)
        except ImportError:
            pass
    # Common install locations (winget, scoop, chocolatey, manual)
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    patterns = [
        (local / "Microsoft" / "WinGet" / "Packages", "*FFmpeg*/**/bin/ffmpeg.exe"),
        (local / "Microsoft" / "WinGet" / "Links", "ffmpeg.exe"),
        (Path.home() / "scoop" / "shims", "ffmpeg.exe"),
        (Path("C:/ProgramData/chocolatey/bin"), "ffmpeg.exe"),
        (Path("C:/ffmpeg"), "**/ffmpeg.exe"),
        (Path("C:/Program Files"), "ffmpeg*/**/ffmpeg.exe"),
    ]
    for base, pattern in patterns:
        if base.exists():
            for hit in base.glob(pattern):
                return str(hit.parent)
    return None


def build_opts(fmt, quality, hook, pp_hook=None):
    opts = {
        "outtmpl": str((VIDEO_DIR if fmt == "video" else SONG_DIR) / "%(title)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": QuietLogger(),
        "progress_hooks": [hook],
        "postprocessor_hooks": [pp_hook] if pp_hook else [],
    }
    ffmpeg_dir = find_ffmpeg()
    if ffmpeg_dir:
        opts["ffmpeg_location"] = ffmpeg_dir
    if fmt == "video":
        q = quality if quality in {"1080", "720", "480"} else "720"
        opts["format"] = (
            f"bestvideo[height<={q}][ext=mp4]+bestaudio[ext=m4a]/"
            f"bestvideo[height<={q}]+bestaudio/best[height<={q}]/best"
        )
        opts["merge_output_format"] = "mp4"
    else:
        q = quality if quality in {"128", "192", "320"} else "192"
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": q},
            {"key": "FFmpegMetadata"},
        ]
    return opts


def download(url, fmt, quality):
    try:
        import yt_dlp
    except ImportError:
        return send({"type": "error", "message": "yt-dlp not installed. Run SETUP.bat."})
    if not find_ffmpeg():
        return send({"type": "error", "message": "ffmpeg not found. Run SETUP.bat, then restart the browser."})

    if not ALLOWED.match(url or ""):
        return send({"type": "error", "message": "Only YouTube URLs are supported."})
    fmt = "video" if fmt == "video" else "mp3"
    quality = str(quality)
    (VIDEO_DIR if fmt == "video" else SONG_DIR).mkdir(parents=True, exist_ok=True)

    # One overall percentage that only ever moves forward. Each stage owns a slice:
    #   MP3:   download 0-95,                 convert 95-100
    #   Video: video stream 0-80, audio 80-95, merge   95-100
    # (Previously each stream reported its own 0-100%, and yt-dlp's size estimate
    # changes mid-download, so the bar jumped backwards.)
    best = {"pct": 0}

    def report(message, pct=None):
        if pct is not None:
            best["pct"] = max(best["pct"], min(99, int(pct)))
        send({"type": "progress", "message": message, "percent": best["pct"] or None})

    def hook(d):
        if d["status"] != "downloading":
            return
        info = d.get("info_dict") or {}
        total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
        done = d.get("downloaded_bytes", 0)
        if total:
            frac = min(1.0, done / total)
        elif d.get("fragment_count"):  # streamed in pieces with no byte total
            frac = min(1.0, (d.get("fragment_index") or 0) / d["fragment_count"])
        else:
            frac = None

        part = ""
        lo, hi = 0, 95
        if fmt == "video":
            if info.get("vcodec") == "none":
                part, lo, hi = " audio", 80, 95
            else:
                part, lo, hi = " video", 0, 80
        pct = lo + frac * (hi - lo) if frac is not None else None

        bits = [f"Downloading{part}…"]
        if total:
            bits.append(f"{done / 1048576:.1f} / {total / 1048576:.1f} MB")
        if d.get("speed"):
            bits.append(f"{d['speed'] / 1048576:.1f} MB/s")
        if d.get("eta") is not None:
            bits.append(f"{int(d['eta'])}s left")
        report(" · ".join(bits), pct)

    def pp_hook(d):
        if d["status"] == "started" and d.get("postprocessor") in ("Merger", "ExtractAudio"):
            report("Merging video + audio…" if fmt == "video" else "Converting to MP3…", 96)

    try:
        with yt_dlp.YoutubeDL(build_opts(fmt, quality, hook, pp_hook)) as ydl:
            info = ydl.extract_info(url, download=True)
            downloads = info.get("requested_downloads") or []
            file = downloads[-1].get("filepath") if downloads else None
            if not file:
                file = str(Path(ydl.prepare_filename(info)).with_suffix(".mp4" if fmt == "video" else ".mp3"))
        send({"type": "done", "file": file, "format": fmt})
    except Exception as e:  # report any failure (missing ffmpeg, unavailable video, ...) to the page
        msg = str(e)
        if "ffmpeg" in msg.lower() or "ffprobe" in msg.lower():
            msg = "ffmpeg not found. Run SETUP.bat (or restart your PC after setup)."
        send({"type": "error", "message": msg[:300]})


def main():
    while True:
        msg = read()
        if msg is None:
            break
        if msg.get("action") == "download":
            download(msg.get("url"), msg.get("format"), msg.get("quality"))
        elif msg.get("action") == "reveal":
            reveal(msg.get("file"), msg.get("format"))
        elif msg.get("action") == "update":
            update()


REPO_ZIP = "https://codeload.github.com/r34sd/ashuflow-extension/zip/refs/heads/main"
ROOT = Path(__file__).resolve().parent.parent  # project folder (contains extension/ and host/)
UPDATABLE = ("extension/", "host/", "README.md", "SETUP.bat", ".gitignore")


def update():
    """Pull the latest code from GitHub into this folder, then update yt-dlp.

    Every subprocess has its output captured: stdout is the messaging channel,
    so anything printed there would corrupt the connection to the browser.
    """
    import subprocess
    try:
        if (ROOT / ".git").is_dir() and shutil.which("git"):
            send({"type": "update-progress", "message": "Pulling latest code from GitHub…"})
            r = subprocess.run(["git", "-C", str(ROOT), "pull", "--ff-only"], capture_output=True, text=True, timeout=120)
            if r.returncode != 0:
                return send({"type": "error", "message": f"git pull failed: {(r.stderr or r.stdout).strip()[:250]}"})
            changed = "Already up to date" not in r.stdout
        else:
            changed = update_from_zip()

        send({"type": "update-progress", "message": "Updating yt-dlp…"})
        r = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--upgrade", "--quiet", "yt-dlp"],
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            return send({"type": "error", "message": f"Code updated, but yt-dlp update failed: {r.stderr.strip()[:200]}"})

        send({"type": "updated", "message": "Updated! Reloading…" if changed else "Already up to date. Reloading…"})
    except Exception as e:
        send({"type": "error", "message": f"Update failed: {e}"[:300]})


def update_from_zip():
    """Download the repo zip and copy changed files over this folder. Returns True if anything changed."""
    import io
    import urllib.request
    import zipfile

    send({"type": "update-progress", "message": "Downloading latest version from GitHub…"})
    with urllib.request.urlopen(REPO_ZIP, timeout=60) as resp:
        data = resp.read()
    changed = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if name.endswith("/"):
                continue
            rel = name.split("/", 1)[1] if "/" in name else ""  # strip "ashuflow-extension-main/"
            parts = Path(rel).parts
            # Only known project files; refuse anything that tries to escape the folder
            if not rel or ".." in parts or Path(rel).is_absolute() or not rel.startswith(UPDATABLE):
                continue
            target = ROOT / rel
            new = z.read(name)
            if target.exists() and target.read_bytes() == new:
                continue  # unchanged (also avoids rewriting host.bat while it's running)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(new)
            changed += 1
    send({"type": "update-progress", "message": f"Updated {changed} file(s)."})
    return changed > 0


def reveal(file, fmt=None):
    """Open Explorer at the Songs/Videos folder with the downloaded file selected."""
    import subprocess
    try:
        folder = VIDEO_DIR if fmt == "video" else SONG_DIR
        folder.mkdir(parents=True, exist_ok=True)
        p = Path(file).resolve() if file else None
        if p and p.is_file() and OUT_DIR.resolve() in p.parents:
            # Must be a raw command string: list form makes Python quote the whole
            # "/select,..." argument, which Explorer ignores (it then opens Documents).
            subprocess.Popen(f'explorer /select,"{p}"')
        else:
            subprocess.Popen(f'explorer "{folder.resolve()}"')
        send({"type": "revealed"})
    except Exception as e:
        send({"type": "error", "message": f"Couldn't open folder: {e}"[:300]})


if __name__ == "__main__":
    main()
