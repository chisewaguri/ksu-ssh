"use strict";

const $ = (selector) => document.querySelector(selector);
const run = SSHBridge.run;
const state = { running: false, user: "root", settings: {}, ready: false, busy: false, dirty: false, configLoaded: false, savedConfig: "", restartNeeded: false, addresses: [] };
let toastTimer;

function records(output) {
  return output.trim().split("\n").filter(Boolean).map((line) => line.split("\t"));
}

function encode(value) {
  let binary = "";
  new TextEncoder().encode(value).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
}

function notify(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4000);
}

function showError(error) {
  $("#error-message").textContent = error instanceof Error ? error.message : String(error);
  $("#error-panel").hidden = false;
  $("#error-panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function confirmAction(title, detail, action) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-detail").textContent = detail;
  $("#confirm-action").textContent = action;
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}

function controls() {
  document.querySelectorAll(".page-panel button, .page-panel input, .page-panel textarea, .page-panel select, dialog button, dialog input, dialog textarea").forEach((element) => {
    element.disabled = state.busy || !state.ready;
  });
  $("#refresh").disabled = state.busy;
  document.querySelectorAll(".nav-item").forEach((element) => { element.disabled = state.busy; });
  const allowed = state.settings["password-auth"] === "1" && state.settings["root-login"] !== "disabled";
  $("#root-password").disabled = state.busy || !state.ready || !allowed;
  $("#root-password-row").classList.toggle("disabled", !allowed);
  $("#root-password-help").textContent = allowed
    ? "Also let root sign in with its password"
    : "Enable password authentication and root login first";
  $("#config-editor").disabled = state.busy || !state.ready || !state.configLoaded;
  $("#save-config").disabled = state.busy || !state.ready || !state.configLoaded || !state.dirty;
  $("#discard-config").disabled = state.busy || !state.dirty;
  $("#config-status").textContent = state.dirty ? "Unsaved edits" : state.configLoaded ? "Saved" : "Not loaded";
  $("#pending-settings").hidden = !state.restartNeeded;
  $("#pending-detail").textContent = state.running ? "Restart SSH to apply your changes. Existing sessions may disconnect." : "Your changes will apply when SSH starts.";
  $("#apply-settings").textContent = state.running ? "Restart to apply" : "Start SSH";
  $("#apply-settings").disabled = state.busy || !state.ready;
  $("#activity").hidden = !state.busy;
  document.querySelector("main").setAttribute("aria-busy", String(state.busy));
}

async function perform(action, label = "Loading...") {
  if (state.busy) return;
  state.busy = true;
  $("#activity").textContent = label;
  controls();
  $("#error-panel").hidden = true;
  try { await action(); }
  catch (error) { showError(error); }
  finally { state.busy = false; controls(); }
}

async function loadService() {
  const values = Object.fromEntries(records(await run(["state"])));
  if (!["running", "stopped"].includes(values.state)) throw new Error("Could not read SSH status.");
  state.running = values.state === "running";
  $("#service-badge").classList.toggle("running", state.running);
  $("#service-badge").lastChild.textContent = state.running ? "Running" : "Stopped";
  $("#service-title").textContent = state.running ? "SSH is running" : "SSH is stopped";
  $("#service-detail").textContent = state.running ? `Configured port ${values.port}` : "Start the service when you need it";
  $("#service-toggle").textContent = state.running ? "Stop" : "Start";
  $("#service-restart").hidden = !state.running;
}

function renderSettings() {
  $("#autostart").checked = state.settings.autostart === "1";
  $("#port-value").textContent = state.settings.port;
  $("#password-auth").checked = state.settings["password-auth"] === "1";
  $("#root-login").checked = state.settings["root-login"] !== "disabled";
  $("#root-password").checked = state.settings["root-login"] === "password";
}

async function loadSettings() {
  state.settings = Object.fromEntries(records(await run(["settings", "get"])));
  if (!state.settings.port) throw new Error("Could not read SSH settings.");
  renderSettings();
}

async function loadAddresses() {
  state.addresses = (await run(["addresses"])).trim().split("\n").filter(Boolean);
  renderConnections();
}

function renderConnections() {
  const user = $("#connection-user").value;
  $("#connection-help").textContent = state.restartNeeded
    ? "These commands use your saved port. Apply your changes before connecting."
    : state.running ? "Run a command on a computer on the same network." : "Start SSH, then run a command on your computer.";
  $("#connection-list").replaceChildren();
  for (const address of state.addresses) {
    const row = document.createElement("div");
    row.className = "connection-command";
    const code = document.createElement("code");
    code.textContent = `ssh -p ${state.settings.port} ${user}@${address}`;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy command for ${user} at ${address}`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        notify("Connection command copied");
      } catch (_) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        notify("Command selected. Touch and hold it to copy.");
      }
    });
    row.append(code, copy);
    $("#connection-list").append(row);
  }
  if (!state.addresses.length) $("#connection-list").textContent = "No network address found. Connect to Wi-Fi, then tap Refresh.";
}

async function refresh() {
  await perform(async () => {
    try {
      await loadService();
      await loadSettings();
      state.ready = true;
    } catch (error) {
      state.ready = false;
      $("#service-badge").classList.remove("running");
      $("#service-badge").lastChild.textContent = "Unavailable";
      $("#service-title").textContent = "Could not connect";
      $("#service-detail").textContent = "Check the message below and tap Refresh to retry.";
      throw error;
    }
    await loadAddresses();
    const page = document.querySelector(".nav-item.active").dataset.target;
    if (page === "keys") await loadKeys();
    if (page === "advanced") await loadAdvanced();
  });
}

async function serviceAction(action) {
  await perform(async () => {
    try { await run(["service", action]); }
    finally { await loadService(); }
    if (action !== "stop") state.restartNeeded = false;
    renderConnections();
    notify(action === "restart" ? "SSH restarted" : `SSH ${action === "start" ? "started" : "stopped"}`);
  }, action === "restart" ? "Restarting SSH..." : action === "start" ? "Starting SSH..." : "Stopping SSH...");
}

async function setSetting(name, value) {
  if (state.dirty && name !== "autostart") {
    renderSettings();
    showError(new Error("Save or discard your configuration edits in Advanced before changing login settings or the port."));
    return;
  }
  await perform(async () => {
    try {
      await run(["settings", "set", name, value]);
      if (name !== "autostart") state.restartNeeded = true;
      await loadSettings();
      $("#save-note").textContent = name === "autostart" ? "Boot preference saved." : "Saved. Restart SSH to apply.";
      await loadService();
      await loadAddresses();
    } finally { renderSettings(); }
  }, "Saving setting...");
}

async function loadKeys() {
  const list = $("#key-list");
  list.replaceChildren();
  $("#keys-empty").hidden = true;
  $("#key-count").textContent = "";
  list.textContent = "Loading keys...";
  let output;
  try { output = await run(["keys", "list", state.user]); }
  catch (error) { list.textContent = "Could not load keys. Tap Refresh to try again."; throw error; }
  list.replaceChildren();
  const keys = records(output);
  $("#key-count").textContent = String(keys.length);
  $("#keys-empty").hidden = keys.length !== 0;
  for (const [, encodedKey, encodedInfo] of keys) {
    const key = decode(encodedKey);
    const info = decode(encodedInfo);
    const match = info.match(/^\d+\s+(\S+)\s+(.+)\s+\(([^)]+)\)$/);
    const comment = match ? match[2] : "SSH key";
    const row = document.createElement("div");
    row.className = "key-row";
    const mark = document.createElement("span");
    mark.className = "key-mark";
    mark.textContent = match ? match[3].slice(0, 4) : "KEY";
    const copy = document.createElement("div");
    copy.className = "key-copy";
    const title = document.createElement("strong");
    title.textContent = comment;
    const fingerprint = document.createElement("span");
    fingerprint.textContent = match ? match[1] : info;
    fingerprint.title = fingerprint.textContent;
    copy.append(title, fingerprint);
    const remove = document.createElement("button");
    remove.className = "remove-key";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${comment}`);
    remove.addEventListener("click", async () => {
      if (!await confirmAction("Remove this key?", `${comment} will no longer be able to sign in as ${state.user} with this key. Existing sessions stay connected.`, "Remove key")) return;
      perform(async () => {
        await run(["keys", "delete", state.user, encode(key)]);
        await loadKeys();
        notify("Key removed");
      });
    });
    row.append(mark, copy, remove);
    list.append(row);
  }
}

async function loadAdvanced() {
  if (!state.dirty) {
    state.configLoaded = false;
    const [, value] = records(await run(["config", "get"]))[0];
    $("#config-editor").value = decode(value);
    state.savedConfig = $("#config-editor").value;
    state.configLoaded = true;
  }
  $("#service-log").textContent = (await run(["log"])).trim() || "No service operations recorded yet.";
}

async function showPage(name) {
  document.querySelectorAll(".page-panel").forEach((panel) => { panel.hidden = panel.dataset.page !== name; });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === name);
    if (item.dataset.target === name) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "auto" });
  if (!state.ready) return;
  await perform(async () => {
    if (name === "home") { await loadService(); await loadAddresses(); }
    if (name === "keys") await loadKeys();
    if (name === "advanced") await loadAdvanced();
  });
}

$("#refresh").addEventListener("click", refresh);
$("#dismiss-error").addEventListener("click", () => { $("#error-panel").hidden = true; });
$("#apply-settings").addEventListener("click", () => serviceAction(state.running ? "restart" : "start"));
$("#connection-user").addEventListener("change", renderConnections);
$("#setup-keys").addEventListener("click", () => {
  selectUser($("#connection-user").value);
  showPage("keys");
});
$("#service-toggle").addEventListener("click", () => serviceAction(state.running ? "stop" : "start"));
$("#service-restart").addEventListener("click", () => serviceAction("restart"));
function selectUser(user) {
  state.user = user;
  for (const name of ["root", "shell"]) {
    $(`#${name}-tab`).setAttribute("aria-selected", String(name === user));
    $(`#${name}-tab`).tabIndex = name === user ? 0 : -1;
  }
  $("#key-list").setAttribute("aria-labelledby", `${user}-tab`);
  $("#key-account-help").textContent = user === "root" ? "Root keys grant full device access." : "Shell keys grant access to the unprivileged Android shell account.";
}
for (const user of ["root", "shell"]) {
  $(`#${user}-tab`).addEventListener("click", () => perform(async () => {
    selectUser(user);
    await loadKeys();
  }));
  $(`#${user}-tab`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "root" : event.key === "End" ? "shell" : user === "root" ? "shell" : "root";
    $(`#${next}-tab`).focus();
    $(`#${next}-tab`).click();
  });
}

$("#add-key").addEventListener("click", () => {
  $("#key-input").value = "";
  $("#key-error").textContent = "";
  $("#key-user").textContent = state.user;
  $("#key-dialog").showModal();
  $("#key-input").focus();
});
$("#add-first-key").addEventListener("click", () => $("#add-key").click());
$("#import-key").addEventListener("click", () => { $("#key-file").value = ""; $("#key-file").click(); });
$("#key-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error("Choose a public key file smaller than 64 KB.");
    const key = await file.text();
    if (/PRIVATE KEY/.test(key)) throw new Error("This is a private key. Choose the matching .pub file instead.");
    $("#key-input").value = key.trim();
    $("#key-error").textContent = "";
  } catch (error) { $("#key-error").textContent = error.message; }
});
$("#key-dialog form").addEventListener("submit", async (event) => {
  if (event.submitter.value === "cancel") return;
  event.preventDefault();
  if (/PRIVATE KEY/.test($("#key-input").value)) {
    $("#key-error").textContent = "Use your public .pub key. Keep the private key on your computer.";
    return;
  }
  $("#confirm-key").textContent = "Adding...";
  await perform(async () => {
    try {
      await run(["keys", "add", state.user, encode($("#key-input").value.trim())]);
    } catch (error) { $("#key-error").textContent = error.message; return; }
    $("#key-dialog").close();
    await loadKeys();
    notify("Key added");
  }, "Adding key...");
  $("#confirm-key").textContent = "Add key";
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
$("#port-dialog form").addEventListener("submit", async (event) => {
  if (event.submitter.value === "cancel") return;
  event.preventDefault();
  await setSetting("port", $("#port-input").value);
  if ($("#error-panel").hidden) $("#port-dialog").close();
  else $("#port-error").textContent = $("#error-message").textContent;
});

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => showPage(item.dataset.target)));
$("#config-editor").addEventListener("input", () => { state.dirty = $("#config-editor").value !== state.savedConfig; controls(); });
$("#discard-config").addEventListener("click", async () => {
  if (!await confirmAction("Discard your edits?", "Your saved configuration will stay unchanged.", "Discard edits")) return;
  $("#config-editor").value = state.savedConfig;
  state.dirty = false;
  controls();
});
window.addEventListener("beforeunload", (event) => {
  if (state.dirty) { event.preventDefault(); event.returnValue = ""; }
});
$("#save-config").addEventListener("click", () => perform(async () => {
  await run(["config", "save", encode($("#config-editor").value)]);
  state.dirty = false;
  state.savedConfig = $("#config-editor").value;
  state.restartNeeded = true;
  await loadSettings();
  notify("Configuration saved. Restart SSH to apply.");
}, "Validating and saving configuration..."));
$("#refresh-log").addEventListener("click", () => perform(loadAdvanced));

controls();
refresh();
