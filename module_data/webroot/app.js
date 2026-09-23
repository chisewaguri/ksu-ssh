import { spawn } from "./vendor/kernelsu.js";

const CONTROLLER = "/data/adb/ssh/bin/ksu-ssh-webui";
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

function run(args) {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.ksu === "undefined") {
      reject(new Error("Open this WebUI inside KernelSU or APatch"));
      return;
    }
    const child = spawn(CONTROLLER, args);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("The root command did not respond"));
    }, 10000);
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (Number(code) === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Command failed (${code})`));
    });
  });
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
  const badge = $("#service-badge");
  badge.classList.remove("running");
  badge.lastChild.textContent = "Unavailable";
  $("#service-title").textContent = "Controls unavailable";
  $("#service-detail").textContent = message;
  $("#service-toggle").hidden = true;
  $("#service-restart").hidden = true;
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
  const badge = $("#service-badge");
  badge.classList.toggle("running", state.running);
  badge.lastChild.textContent = state.running ? "Running" : "Stopped";
  $("#service-title").textContent = state.running ? "SSH is running" : "SSH is stopped";
  $("#service-detail").textContent = state.running ? `Listening on port ${values.port}` : "Start the service when you need it";
  $("#service-toggle").textContent = state.running ? "Stop" : "Start";
  $("#service-restart").hidden = !state.running;
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
      const fingerprint = document.createElement("span");
      fingerprint.textContent = detail.fingerprint;
      copy.append(title, fingerprint);
      const remove = document.createElement("button");
      remove.className = "remove-key";
      remove.type = "button";
      remove.textContent = "Remove";
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
  $("#password-auth").checked = state.settings["password-auth"] === "1";
  $("#root-login").checked = state.settings["root-login"] !== "disabled";
  $("#root-password").checked = state.settings["root-login"] === "password";
  const rootPasswordReady = $("#password-auth").checked && $("#root-login").checked;
  $("#root-password").disabled = !rootPasswordReady;
  $("#root-password-row").classList.toggle("disabled", !rootPasswordReady);
  $("#root-password-help").textContent = rootPasswordReady
    ? "Also let root sign in with its password"
    : "Requires shell password login and root key login";
}

async function loadSettings() {
  state.settings = Object.fromEntries(records(await run(["settings", "get"])));
  renderSettings();
}

function saved() {
  const note = $("#save-note");
  note.textContent = "Saved. Applies next time SSH starts.";
  setTimeout(() => { note.textContent = ""; }, 5000);
}

function setSetting(name, value) {
  return queueConfigWrite(async () => {
    const previous = { ...state.settings };
    try {
      await run(["settings", "set", name, value]);
      await loadSettings();
      saved();
    } catch (error) {
      state.settings = previous;
      renderSettings();
      notify(errorMessage(error));
    }
  });
}

$("#service-toggle").addEventListener("click", () => serviceAction(state.running ? "stop" : "start"));
$("#service-restart").addEventListener("click", () => serviceAction("restart"));
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
$("#root-login").addEventListener("change", (event) => setSetting("root-login", event.target.checked ? "keys" : "disabled"));
$("#root-password").addEventListener("change", (event) => setSetting("root-login", event.target.checked ? "password" : "keys"));

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
      notify("Configuration saved");
      saved();
    });
  }
  catch (error) { notify(errorMessage(error)); }
  finally { button.disabled = false; }
});

Promise.all([loadService(), loadSettings(), loadKeys()]).catch(showUnavailable);
