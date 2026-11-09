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

// No file given, so the helper just opens the folder
$("songs").addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal", file: "", format: "mp3", folderOnly: true }));
$("videos").addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal", file: "", format: "video", folderOnly: true }));
