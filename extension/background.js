const HOST = "com.ytmp3.host";
const REPO = "r34sd/saflow-extension";
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/main/extension/manifest.json`;
const CHECK_EVERY_MIN = 6 * 60;

let port = null;
let activeTab = null; // tab whose in-page button started the current download
let state = { status: "idle", message: "", percent: 0 };
let updating = false;

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

// ---------- Update checker ----------

function isNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

async function checkForUpdate() {
  const local = chrome.runtime.getManifest().version;
  let info;
  try {
    const res = await fetch(`${REMOTE_MANIFEST}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const remote = (await res.json()).version;
    info = { local, remote, available: isNewer(remote, local), checked: Date.now() };
  } catch (e) {
    info = { local, error: `Couldn't check for updates: ${e.message || e}`, checked: Date.now() };
  }
  await chrome.storage.local.set({ update: info });
  chrome.action.setBadgeText({ text: info.available ? "NEW" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#DB2777" });
  return info;
}

function updateMsg(msg) {
  chrome.runtime.sendMessage({ type: "updateState", ...msg }).catch(() => {});
}

function installUpdate() {
  if (updating) return;
  updating = true;
  const p = chrome.runtime.connectNative(HOST);
  p.onMessage.addListener((msg) => {
    if (msg.type === "update-progress") updateMsg({ status: "working", message: msg.message });
    else if (msg.type === "error") { updating = false; updateMsg({ status: "error", message: msg.message }); p.disconnect(); }
    else if (msg.type === "updated") {
      updateMsg({ status: "done", message: msg.message || "Updated! Reloading…" });
      p.disconnect();
      chrome.action.setBadgeText({ text: "" });
      // New files are on disk now; reloading the extension picks them up
      setTimeout(() => chrome.runtime.reload(), 1200);
    }
  });
  p.onDisconnect.addListener(() => {
    if (updating && chrome.runtime.lastError) {
      updating = false;
      updateMsg({ status: "error", message: `Helper not found - run SETUP.bat. (${chrome.runtime.lastError.message})` });
    }
  });
  updateMsg({ status: "working", message: "Starting update…" });
  p.postMessage({ action: "update" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("update-check", { periodInMinutes: CHECK_EVERY_MIN });
  checkForUpdate();
});
chrome.runtime.onStartup.addListener(checkForUpdate);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "update-check") checkForUpdate(); });

// ---------- Messages from the page and the toolbar menu ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "getState") {
    reply(state);
  } else if (msg.type === "getUpdate") {
    chrome.storage.local.get("update").then(({ update }) => reply(update || null));
    return true;
  } else if (msg.type === "checkUpdate") {
    checkForUpdate().then(reply);
    return true;
  } else if (msg.type === "installUpdate") {
    if (state.status === "working") {
      reply({ ok: false, error: "Wait for the current download to finish first." });
      return;
    }
    installUpdate();
    reply({ ok: true });
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
    if (updating) {
      reply({ ok: false, error: "SAFlow is updating - try again in a moment." });
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
