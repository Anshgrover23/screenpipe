// src/config.ts
var DEFAULT_BASE_URL = "http://127.0.0.1:3030";
var STORAGE_KEY_TOKEN = "screenpipe_token";
var STORAGE_KEY_BASE_URL = "screenpipe_base_url";
function buildWsUrl(baseHttpUrl, token) {
  const base = baseHttpUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const path = "/browser/ws";
  if (!token)
    return `${base}${path}`;
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
function healthUrl(baseHttpUrl) {
  return `${baseHttpUrl.replace(/\/$/, "")}/health`;
}
function browserStatusUrl(baseHttpUrl) {
  return `${baseHttpUrl.replace(/\/$/, "")}/browser/status`;
}

// src/popup.ts
var $ = (id) => document.getElementById(id);
async function getConfig() {
  const s = await chrome.storage.local.get([STORAGE_KEY_TOKEN, STORAGE_KEY_BASE_URL]);
  return {
    token: s[STORAGE_KEY_TOKEN] ?? "",
    baseUrl: s[STORAGE_KEY_BASE_URL] ?? DEFAULT_BASE_URL
  };
}
async function probeStatus(token, baseUrl) {
  try {
    const h = await fetch(healthUrl(baseUrl), {
      signal: AbortSignal.timeout(3000)
    });
    if (!h.ok)
      return "server_down";
  } catch {
    return "server_down";
  }
  try {
    const headers = {};
    if (token)
      headers["Authorization"] = `Bearer ${token}`;
    const r = await fetch(browserStatusUrl(baseUrl), {
      headers,
      signal: AbortSignal.timeout(3000)
    });
    if (r.status === 401 || r.status === 403)
      return "auth_required";
    if (!r.ok)
      return "error";
    const data = await r.json();
    return data.connected === true ? "ok" : "bridge_down";
  } catch {
    return "error";
  }
}
function setStatusUI(status) {
  const bar = $("status-bar");
  const text = $("status-text");
  bar.dataset.state = status;
  const labels = {
    checking: "checking…",
    ok: "bridge connected",
    bridge_down: "server reachable — bridge connecting…",
    auth_required: "needs token — open settings",
    server_down: "screenpipe not running",
    error: "connection error"
  };
  text.textContent = labels[status];
}
function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)
    return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)
    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)
    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderResults(items) {
  const container = $("results");
  if (!items.length) {
    container.innerHTML = '<p class="empty">no results found</p>';
    return;
  }
  container.innerHTML = items.map((item) => {
    const isOcr = item.type === "OCR";
    const c = item.content;
    const text = isOcr ? c.text ?? "" : c.transcription ?? "";
    const label = isOcr ? c.app_name || "screen" : c.device || "audio";
    const ts = c.timestamp ?? "";
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 140);
    return `<div class="result-item">
        <div class="result-meta">
          <span class="result-label">${escHtml(label)}</span>
          <span class="result-time">${ts ? relativeTime(ts) : ""}</span>
        </div>
        <div class="result-text">${escHtml(snippet)}${text.length > 140 ? "…" : ""}</div>
      </div>`;
  }).join("");
}
async function doSearch(token, baseUrl) {
  const query = $("query").value.trim();
  const container = $("results");
  if (!query)
    return;
  container.innerHTML = '<p class="empty">searching…</p>';
  try {
    const headers = {};
    if (token)
      headers["Authorization"] = `Bearer ${token}`;
    const url = `${baseUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&limit=8&content_type=all`;
    const r = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000)
    });
    if (r.status === 401 || r.status === 403) {
      container.innerHTML = `<p class="empty error">no token — click ⚙ to add one in settings</p>`;
      return;
    }
    if (!r.ok) {
      container.innerHTML = `<p class="empty error">server error ${r.status}</p>`;
      return;
    }
    const data = await r.json();
    renderResults(data.data ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    container.innerHTML = `<p class="empty error">${escHtml(msg)}</p>`;
  }
}
async function init() {
  const { token, baseUrl } = await getConfig();
  $("settings-btn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  const runSearch = () => void doSearch(token, baseUrl);
  $("query").addEventListener("keydown", (e) => {
    if (e.key === "Enter")
      runSearch();
  });
  $("search-btn").addEventListener("click", runSearch);
  try {
    chrome.runtime.sendMessage({ type: "wake" });
  } catch {}
  await new Promise((r) => setTimeout(r, 600));
  const status = await probeStatus(token, baseUrl);
  setStatusUI(status);
}
document.addEventListener("DOMContentLoaded", () => void init());
