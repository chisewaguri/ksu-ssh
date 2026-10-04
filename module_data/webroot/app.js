import { exec, shellQuote } from "./vendor/kernelsu.js";

const CONTROLLER = "/data/adb/ssh/bin/ksu-ssh-webui";
const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/></svg>';
const $ = (selector) => document.querySelector(selector);
const state = { running: false, user: "root", settings: {}, configLoaded: false, configBase: "" };
let toastTimer;
let configWrites = Promise.resolve();

function queueConfigWrite(operation) {
  const pending = configWrites.then(operation);
  configWrites = pending.catch(() => {});
  return pending;
}

async function showPage(name) {
  document.querySelectorAll(".page-panel").forEach((panel) => {
    const active = panel.dataset.page === name;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.target === name;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "auto" });
  if (name === "advanced") {
    try {
      await configWrites;
      const [, encoded] = records(await run(["config", "get"]))[0];
      const editor = $("#config-editor");
      if (!state.configLoaded || editor.value === state.configBase) {
        editor.value = decode(encoded);
        state.configBase = editor.value;
        state.configLoaded = true;
      }
    } catch (error) { notify(errorMessage(error)); }
  }
}

async function run(args) {
  if (typeof globalThis.ksu === "undefined") throw new Error("Open this WebUI inside KernelSU or APatch");
  // ksu.spawn drops the newline after each stdout line, which merges the tab-separated records.
  const command = [CONTROLLER, ...args].map(shellQuote).join(" ");
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("The root command did not respond")), 10000);
  });
  try {
    const { errno, stdout, stderr } = await Promise.race([exec(command), timedOut]);
    if (Number(errno) !== 0) throw new Error(stderr.trim() || `Command failed (${errno})`);
    return stdout;
  } finally { clearTimeout(timeout); }
}

function records(output) {
  return output.trim().split("\n").filter(Boolean).map((line) => line.split("\t"));
}

function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value) {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function notify(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function showUnavailable(error) {
  const message = errorMessage(error);
  $("#status").dataset.state = "unavailable";
  $("#service-title").textContent = "Unavailable";
  $("#service-detail").textContent = message;
  $("#service-detail").hidden = false;
  $("#service-toggle").hidden = true;
  $("#service-restart").hidden = true;
  $("#address-row").hidden = true;
  document.querySelectorAll(".page-panel button, .page-panel input").forEach((element) => {
    element.disabled = true;
  });
  notify(message);
}

function setBusy(busy) {
  document.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
  if (!busy) renderSettings();
}

async function loadService() {
  const values = Object.fromEntries(records(await run(["state"])));
  state.running = values.state === "running";
  const address = values.address || "";
  $("#status").dataset.state = state.running ? "running" : "stopped";
  $("#service-title").textContent = state.running ? "Running" : "Stopped";
  $("#service-detail").textContent = state.running ? "No network connection" : `Port ${values.port}`;
  $("#service-detail").hidden = state.running && address !== "";
  $("#address-row").hidden = !state.running || !address;
  $("#address-command").textContent = address ? `ssh shell@${address} -p ${values.port}` : "";
  const toggle = $("#service-toggle");
  toggle.textContent = state.running ? "Stop" : "Start";
  toggle.className = state.running ? "outlined" : "primary";
  toggle.hidden = false;
  $("#service-restart").hidden = !state.running;
}

async function copyAddress() {
  const text = $("#address-command").textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    notify("Copied");
  } catch {
    notify(text);
  }
}

async function serviceAction(action) {
  setBusy(true);
  try {
    await run(["service", action]);
    await loadService();
    notify(action === "restart" ? "SSH restarted" : `SSH ${action === "start" ? "started" : "stopped"}`);
  } catch (error) { notify(errorMessage(error)); }
  finally { setBusy(false); }
}

function keyDetails(info) {
  const match = info.match(/^\d+\s+(\S+)\s+(.+)\s+\(([^)]+)\)$/);
  if (!match) return { fingerprint: info, comment: "SSH key", type: "KEY" };
  return {
    fingerprint: match[1],
    comment: match[2] === "no comment" ? "SSH key" : match[2],
    type: match[3].replace(/^ED25519$/i, "ED").replace(/^RSA$/i, "RSA").slice(0, 4).toUpperCase(),
  };
}

async function loadKeys() {
  const list = $("#key-list");
  list.dataset.user = state.user;
  list.replaceChildren();
  try {
    const output = await run(["keys", "list", state.user]);
    records(output).forEach(([, encodedKey, encodedInfo]) => {
      const key = decode(encodedKey);
      const detail = keyDetails(decode(encodedInfo));
      const row = document.createElement("div");
      row.className = "key-row";
      const mark = document.createElement("span");
      mark.className = "key-mark";
      mark.textContent = detail.type;
      const copy = document.createElement("div");
      copy.className = "key-copy";
      const title = document.createElement("strong");
      title.textContent = detail.comment;
      const fingerprint = document.createElement("code");
      fingerprint.textContent = detail.fingerprint;
      copy.append(title, fingerprint);
      const remove = document.createElement("button");
      remove.className = "remove-key";
      remove.type = "button";
      remove.innerHTML = TRASH_ICON;
      remove.setAttribute("aria-label", `Remove ${detail.comment}`);
      remove.addEventListener("click", async () => {
        if (!confirm(`Remove “${detail.comment}” from ${state.user}?`)) return;
        try { await run(["keys", "delete", state.user, encode(key)]); await loadKeys(); notify("Key removed"); }
        catch (error) { notify(errorMessage(error)); }
      });
      row.append(mark, copy, remove);
      list.append(row);
    });
  } catch (error) { notify(errorMessage(error)); }
}

function selectUser(user) {
  state.user = user;
  ["root", "shell"].forEach((name) => {
    $(`#${name}-tab`).setAttribute("aria-selected", String(name === user));
  });
  loadKeys();
}

function renderSettings() {
  $("#autostart").checked = state.settings.autostart === "1";
  $("#port-value").textContent = state.settings.port;
  const passwords = state.settings["password-auth"] === "1";
  const root = state.settings["root-login"];
  $("#password-auth").checked = passwords;
  $("#root-off").checked = root === "disabled";
  $("#root-keys").checked = root === "keys";
  $("#root-password").checked = root === "password";
  $("#root-password").disabled = !passwords;
  $("#root-password-help").textContent = root === "password"
    ? "Root passwords stay off until password sign-in is on"
    : "Turn on password sign-in to allow root passwords";
  $("#root-password-help").hidden = passwords;
}

async function loadSettings() {
  state.settings = Object.fromEntries(records(await run(["settings", "get"])));
  renderSettings();
}

function markPending() {
  if (!state.running) { notify("Saved"); return; }
  $("#service-detail").textContent = "Restart to apply changes";
  $("#service-detail").hidden = false;
  notify("Saved. Restart SSH to apply");
}

function setSetting(name, value) {
  return queueConfigWrite(async () => {
    const previous = { ...state.settings };
    try {
      await run(["settings", "set", name, value]);
      await loadSettings();
      if (name === "autostart") notify("Saved");
      else markPending();
    } catch (error) {
      state.settings = previous;
      renderSettings();
      notify(errorMessage(error));
    }
  });
}

$("#service-toggle").addEventListener("click", () => serviceAction(state.running ? "stop" : "start"));
$("#service-restart").addEventListener("click", () => serviceAction("restart"));
$("#address-row").addEventListener("click", copyAddress);
$("#root-tab").addEventListener("click", () => selectUser("root"));
$("#shell-tab").addEventListener("click", () => selectUser("shell"));

$("#add-key").addEventListener("click", () => {
  $("#key-input").value = "";
  $("#key-error").textContent = "";
  $("#key-user").textContent = state.user;
  $("#key-dialog").showModal();
});
$("#key-dialog").addEventListener("close", async () => {
  if ($("#key-dialog").returnValue !== "default") return;
  const value = $("#key-input").value.trim();
  if (!value) return;
  try { await run(["keys", "add", state.user, encode(value)]); await loadKeys(); notify("Key added"); }
  catch (error) { notify(errorMessage(error)); }
});

$("#autostart").addEventListener("change", (event) => setSetting("autostart", event.target.checked ? "1" : "0"));
$("#password-auth").addEventListener("change", (event) => setSetting("password-auth", event.target.checked ? "1" : "0"));
["root-off", "root-keys", "root-password"].forEach((id) => {
  $(`#${id}`).addEventListener("change", (event) => {
    if (event.target.checked) return setSetting("root-login", event.target.value);
  });
});

$("#port-row").addEventListener("click", () => {
  $("#port-input").value = state.settings.port;
  $("#port-error").textContent = "";
  $("#port-dialog").showModal();
});
$("#port-dialog").addEventListener("close", async () => {
  if ($("#port-dialog").returnValue !== "default") return;
  const value = $("#port-input").value;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { notify("Port must be between 1 and 65535"); return; }
  await setSetting("port", value);
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => showPage(item.dataset.target));
});
$("#save-config").addEventListener("click", async () => {
  const button = $("#save-config");
  button.disabled = true;
  try {
    await queueConfigWrite(async () => {
      const [, encoded] = records(await run(["config", "get"]))[0];
      if (decode(encoded) !== state.configBase) {
        throw new Error("Configuration changed. Reload the WebUI before saving your edits.");
      }
      const value = $("#config-editor").value;
      await run(["config", "save", encode(value)]);
      state.configBase = value;
      markPending();
    });
  }
  catch (error) { notify(errorMessage(error)); }
  finally { button.disabled = false; }
});

Promise.all([loadService(), loadSettings(), loadKeys()]).catch(showUnavailable);
