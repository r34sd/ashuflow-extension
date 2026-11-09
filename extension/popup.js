// Toolbar menu: status + folder shortcuts only. Downloads start from the in-page button.
const $ = (id) => document.getElementById(id);

function render(state) {
  if (!state || state.status === "idle") return;
  $("statusCard").hidden = false;
  $("msg").textContent = state.message || "";
  $("msg").className = state.status;
  $("fill").style.width = `${state.status === "done" ? 100 : state.percent || 0}%`;
}

chrome.runtime.sendMessage({ type: "getState" }, render);
chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "state") render(msg.state); });

// ---------- Updates ----------
$("ver").textContent = `v${chrome.runtime.getManifest().version}`;

function renderUpdate(info) {
  if (!info) return;
  if (info.available) {
    $("updateCard").hidden = false;
    $("updText").replaceChildren("Update available: ", Object.assign(document.createElement("b"), { textContent: `v${info.remote}` }),
      ` (you have v${info.local})`);
  } else {
    $("updateCard").hidden = true;
  }
}

chrome.runtime.sendMessage({ type: "getUpdate" }, renderUpdate);

$("check").addEventListener("click", () => {
  $("check").textContent = "Checking…";
  chrome.runtime.sendMessage({ type: "checkUpdate" }, (info) => {
    renderUpdate(info);
    $("check").textContent = info?.error ? "Check failed - retry" : info?.available ? "Update available ↑" : "✓ Up to date";
    if (info?.error) $("check").title = info.error;
  });
});

$("updBtn").addEventListener("click", () => {
  $("updBtn").disabled = true;
  chrome.runtime.sendMessage({ type: "installUpdate" }, (res) => {
    if (!res?.ok) { $("updBtn").disabled = false; $("updMsg").textContent = res?.error || "Couldn't start the update."; }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "updateState") return;
  $("updMsg").textContent = msg.message || "";
  $("updMsg").style.color = msg.status === "error" ? "#f87171" : msg.status === "done" ? "#4ade80" : "";
  if (msg.status === "error") $("updBtn").disabled = false;
});

// No file given, so the helper just opens the folder
$("songs").addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal", file: "", format: "mp3", folderOnly: true }));
$("videos").addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal", file: "", format: "video", folderOnly: true }));
