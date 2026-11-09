const HOST = "com.ytmp3.host";
let port = null;
let activeTab = null; // tab whose in-page button started the current download
let state = { status: "idle", message: "", percent: 0 };

function broadcast() {
  chrome.runtime.sendMessage({ type: "state", state }).catch(() => {});
  if (activeTab != null) chrome.tabs.sendMessage(activeTab, { type: "state", state }).catch(() => {});
}

function connect() {
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    if (msg.type === "progress") state = { status: "working", message: msg.message, percent: msg.percent ?? state.percent };
    else if (msg.type === "done") state = { status: "done", message: `Saved: ${msg.file}`, percent: 100, file: msg.file, format: msg.format };
    else if (msg.type === "error") state = { status: "error", message: msg.message, percent: 0 };
    broadcast();
    // Close the helper after each job so the next download always starts a fresh
    // process running the current code (a long-lived helper kept stale code around).
    if (msg.type === "done" || msg.type === "error") {
      port?.disconnect();
      port = null;
    }
  });
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError?.message;
    if (state.status === "working" || err) {
      state = { status: "error", message: err ? `Helper not found - run SETUP.bat. (${err})` : "Helper exited unexpectedly.", percent: 0 };
      broadcast();
    }
    port = null;
  });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "getState") {
    reply(state);
  } else if (msg.type === "reveal") {
    // One-shot: Chrome starts the helper, waits for its reply, then closes it.
    chrome.runtime.sendNativeMessage(
      HOST,
      msg.folderOnly
        ? { action: "reveal", file: "", format: msg.format }
        : { action: "reveal", file: msg.file || state.file || "", format: msg.format || state.format || "mp3" },
      () => { void chrome.runtime.lastError; reply({ ok: true }); }
    );
    return true;
  } else if (msg.type === "download") {
    // Only the in-page button (a content script inside a YouTube tab) may start downloads
    if (!sender.tab) {
      reply({ ok: false, error: "Use the Download button below the YouTube video." });
      return;
    }
    if (state.status === "working") {
      reply({ ok: false, error: "A download is already running." });
      return;
    }
    activeTab = sender.tab?.id ?? null;
    if (!port) connect();
    state = { status: "working", message: "Starting…", percent: 0 };
    port.postMessage({ action: "download", url: msg.url, format: msg.format, quality: msg.quality });
    broadcast();
    reply({ ok: true });
  }
});
