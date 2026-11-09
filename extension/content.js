// ashuflow: adds a download button to the YouTube player's control bar (left of CC).
// YouTube enforces Trusted Types, so everything is built with createElement (no innerHTML).
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const RING = 2 * Math.PI * 10.5; // circumference of the progress ring
  const OPTIONS = [
    { label: "320 kbps", format: "mp3", quality: "320" },
    { label: "192 kbps", format: "mp3", quality: "192" },
    { label: "128 kbps", format: "mp3", quality: "128" },
    { label: "1080p", format: "video", quality: "1080" },
    { label: "720p", format: "video", quality: "720" },
    { label: "480p", format: "video", quality: "480" },
  ];

  const style = document.createElement("style");
  style.textContent = `
    .af-ctrl { display: inline-flex !important; align-items: center; justify-content: center; width: 48px; position: relative; }
    .af-ctrl svg { width: 24px; height: 24px; overflow: visible; filter: drop-shadow(0 0 2px rgba(0,0,0,.5)); }
    .af-ctrl .af-ring { fill: none; stroke: #ec4899; stroke-width: 2; stroke-linecap: round; opacity: 0;
      transition: stroke-dashoffset .25s; }
    .af-ctrl.working .af-ring { opacity: 1; }
    /* Unknown size: a short arc chasing around the circle */
    .af-ctrl.indeterminate .af-ring { stroke-dasharray: 16 50 !important; animation: af-spin 1s linear infinite; }
    @keyframes af-spin { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -66; } }

    .af-menu, .af-toast { position: absolute; z-index: 70; font-family: "YouTube Sans", Roboto, Arial, sans-serif;
      background: rgba(28,28,28,.92); color: #eee; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.4);
      text-shadow: none; }
    .af-menu { padding: 8px 0; min-width: 190px; }
    .af-menu[hidden], .af-toast[hidden], .af-open[hidden] { display: none; }
    .af-head { color: #aaa; font-size: 12px; padding: 6px 16px 4px; text-transform: uppercase; letter-spacing: .5px; }
    .af-item { display: block; width: 100%; text-align: left; background: none; border: 0; color: #eee;
      font-family: inherit; font-size: 14px; font-weight: 500; padding: 10px 16px; cursor: pointer; }
    .af-item:hover { background: rgba(255,255,255,.1); }

    .af-toast { left: 12px; bottom: 64px; width: 300px; padding: 12px 14px; font-size: 13px; }
    .af-toast-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .af-toast-title { font-weight: 600; font-size: 14px; }
    .af-x { background: none; border: 0; color: #aaa; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .af-x:hover { color: #fff; }
    .af-status { word-break: break-word; color: #ccc; }
    .af-status.error { color: #f87171; } .af-status.done { color: #4ade80; }
    .af-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,.2); overflow: hidden; margin-top: 8px; position: relative; }
    .af-track[hidden] { display: none; }
    .af-fill { height: 100%; width: 0; background: linear-gradient(90deg, #7C3AED, #DB2777, #F97316); transition: width .25s; }
    /* Size not known yet: pulse in place instead of sliding back and forth */
    .af-track.indeterminate .af-fill { width: 100%; animation: af-pulse 1.4s ease-in-out infinite; }
    @keyframes af-pulse { 0%, 100% { opacity: .25; } 50% { opacity: .7; } }
    .af-open { margin-top: 10px; background: rgba(255,255,255,.12); color: #fff; border: 0; border-radius: 16px;
      padding: 7px 14px; font: inherit; cursor: pointer; }
    .af-open:hover { background: rgba(255,255,255,.2); }
  `;
  document.documentElement.appendChild(style);

  const ui = {};
  let state = { status: "idle" };
  let lastFile = null, lastFormat = "mp3", jobLabel = "";
  let dismissed = null; // status the user closed the panel on
  let shownPct = 0;     // highest percent shown for the current download

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent?.appendChild(e);
    return e;
  };
  // Keep clicks inside our UI from reaching the player (which would pause/play)
  const shield = (node) => ["click", "mousedown", "dblclick"].forEach((t) => node.addEventListener(t, (e) => e.stopPropagation()));

  function currentUrl() {
    const v = new URLSearchParams(location.search).get("v");
    return v ? `https://www.youtube.com/watch?v=${v}` : null;
  }

  function buildButton() {
    const btn = el("button", "ytp-button af-ctrl");
    btn.setAttribute("aria-label", "Download (ashuflow)");
    btn.title = "Download (ashuflow)";
    const s = svg("svg", { viewBox: "0 0 24 24" }, btn);
    ui.ring = svg("circle", { cx: 12, cy: 12, r: 10.5, class: "af-ring", "stroke-dasharray": RING, "stroke-dashoffset": RING, transform: "rotate(-90 12 12)" }, s);
    const g = svg("g", { fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, s);
    svg("path", { d: "M12 5v8" }, g);
    svg("path", { d: "M8.5 9.5 12 13l3.5-3.5" }, g);
    svg("path", { d: "M6.5 17.5q1.4-1.3 2.75 0t2.75 0 2.75 0 2.75 0" }, g);
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
    return btn;
  }

  function buildMenu() {
    const menu = el("div", "af-menu");
    menu.hidden = true;
    let group = null;
    for (const opt of OPTIONS) {
      if (opt.format !== group) {
        menu.appendChild(el("div", "af-head", opt.format === "mp3" ? "MP3 · Audio" : "MP4 · Video"));
        group = opt.format;
      }
      const item = el("button", "af-item", opt.label);
      item.addEventListener("click", () => start(opt));
      menu.appendChild(item);
    }
    shield(menu);
    return menu;
  }

  function buildToast() {
    const toast = el("div", "af-toast");
    toast.hidden = true;
    const top = el("div", "af-toast-top");
    ui.title = el("span", "af-toast-title", "ashuflow");
    const x = el("button", "af-x", "×");
    x.title = "Close";
    x.addEventListener("click", () => { dismissed = state.status; toast.hidden = true; });
    top.append(ui.title, x);
    ui.status = el("div", "af-status");
    ui.track = el("div", "af-track");
    ui.fill = el("div", "af-fill");
    ui.track.appendChild(ui.fill);
    ui.open = el("button", "af-open", "📂 Show in folder");
    ui.open.addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal", file: lastFile, format: lastFormat }));
    toast.append(top, ui.status, ui.track, ui.open);
    shield(toast);
    return toast;
  }

  function toggleMenu(force) {
    const { menu, btn, player } = ui;
    if (!menu) return;
    menu.hidden = force !== undefined ? !force : !menu.hidden;
    if (!menu.hidden) {
      // Anchor the menu above the button, right-aligned to it
      const p = player.getBoundingClientRect(), b = btn.getBoundingClientRect();
      menu.style.right = `${Math.max(8, p.right - b.right)}px`;
      menu.style.bottom = `${p.bottom - b.top + 8}px`;
    }
  }

  function start(opt) {
    toggleMenu(false);
    const url = currentUrl();
    if (!url) return;
    jobLabel = `${opt.format === "mp3" ? "MP3" : "Video"} · ${opt.label}`;
    dismissed = null;
    shownPct = 0;
    chrome.runtime.sendMessage({ type: "download", url, format: opt.format, quality: opt.quality }, (res) => {
      if (!res?.ok) render({ status: "error", message: res?.error || "Couldn't start the download." });
    });
  }

  function render(s) {
    state = s || state;
    if (state.status !== dismissed) dismissed = null;
    if (state.status === "done") {
      lastFile = state.file || lastFile;
      lastFormat = state.format || lastFormat;
    }
    const working = state.status === "working";
    // Never let the bar move backwards within one download
    shownPct = working ? Math.max(shownPct, state.percent || 0) : 0;
    if (!ui.btn) return;
    const pct = state.status === "done" ? 100 : shownPct;

    // Progress ring on the control-bar button
    ui.btn.classList.toggle("working", working);
    ui.btn.classList.toggle("indeterminate", working && !pct);
    ui.ring.setAttribute("stroke-dashoffset", RING * (1 - pct / 100));
    ui.btn.title = working ? `Downloading… ${pct ? pct + "%" : ""}` : "Download (ashuflow)";

    // Status panel inside the player
    ui.toast.hidden = state.status === "idle" || dismissed === state.status;
    ui.title.textContent =
      state.status === "done" ? "✓ Download complete" :
      state.status === "error" ? "Download failed" :
      `Downloading ${jobLabel}${pct ? ` — ${pct}%` : ""}`.trim();
    ui.status.textContent = state.message || "";
    ui.status.className = `af-status ${state.status}`;
    ui.track.hidden = state.status === "error";
    ui.track.classList.toggle("indeterminate", working && !pct);
    ui.fill.style.width = working && !pct ? "" : `${pct}%`;
    ui.open.hidden = state.status !== "done";
    ui.open.textContent = lastFormat === "video" ? "📂 Show in Videos" : "📂 Show in Songs";
  }

  function inject() {
    if (location.pathname !== "/watch") { toggleMenu(false); return; }
    const player = document.querySelector("#movie_player");
    const right = player?.querySelector(".ytp-right-controls");
    if (!right) return;
    ui.player = player;

    if (!player.querySelector(".af-ctrl")) {
      ui.btn = buildButton();
      const cc = right.querySelector(".ytp-subtitles-button");
      if (cc) cc.parentNode.insertBefore(ui.btn, cc);
      else right.prepend(ui.btn);
    }
    if (!player.querySelector(".af-menu")) player.appendChild(ui.menu = buildMenu());
    if (!player.querySelector(".af-toast")) player.appendChild(ui.toast = buildToast());
    render();
  }

  document.addEventListener("click", () => toggleMenu(false));
  document.addEventListener("yt-navigate-finish", inject);
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; inject(); }, 500);
  }).observe(document.body, { childList: true, subtree: true });
  inject();
  chrome.runtime.sendMessage({ type: "getState" }, (s) => s && render(s));
  chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "state") render(msg.state); });
})();
