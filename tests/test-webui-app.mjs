import assert from "node:assert/strict";

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.lastChild = { textContent: "" };
    this.textContent = "";
    this.value = "";
    this.checked = false;
  }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  trigger(name) { return this.listeners[name]({ target: this }); }
  setAttribute() {}
  removeAttribute() {}
  replaceChildren() {}
}

const ids = new Map();
const get = (id) => {
  if (!ids.has(id)) ids.set(id, new Element());
  return ids.get(id);
};
const panels = [new Element({ page: "home" }), new Element({ page: "advanced" })];
const home = new Element({ target: "home" });
const advanced = new Element({ target: "advanced" });
globalThis.document = {
  querySelector(selector) { return get(selector.slice(1)); },
  querySelectorAll(selector) {
    if (selector === ".page-panel") return panels;
    if (selector === ".nav-item") return [home, advanced];
    return [];
  },
};
globalThis.window = globalThis;
window.scrollTo = () => {};
globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");

let config = "Port 22\nPasswordAuthentication yes\nPermitRootLogin prohibit-password\n";
let completedSets = 0;
globalThis.ksu = {
  spawn(command, encodedArgs, _options, callbackName) {
    assert.equal(command, "/data/adb/ssh/bin/ksu-ssh-webui");
    const args = JSON.parse(encodedArgs);
    const snapshot = config;
    setTimeout(() => {
      let output = "";
      if (args[0] === "state") output = "state\tstopped\nport\t22\n";
      if (args[0] === "keys") output = "";
      if (args[0] === "settings" && args[1] === "get") {
        output = `autostart\t1\nport\t22\npassword-auth\t${config.includes("PasswordAuthentication yes") ? 1 : 0}\nroot-login\t${config.includes("PermitRootLogin no") ? "disabled" : "keys"}\n`;
      }
      if (args[0] === "settings" && args[1] === "set") {
        const directive = args[2] === "password-auth" ? "PasswordAuthentication" : "PermitRootLogin";
        const value = args[2] === "password-auth"
          ? (args[3] === "1" ? "yes" : "no")
          : (args[3] === "disabled" ? "no" : "prohibit-password");
        config = snapshot.replace(new RegExp(`^${directive} .*`, "m"), `${directive} ${value}`);
        completedSets++;
      }
      if (args[0] === "config" && args[1] === "get") {
        output = `config\t${Buffer.from(config).toString("base64")}\n`;
      }
      if (args[0] === "config" && args[1] === "save") {
        config = Buffer.from(args[2], "base64").toString();
      }
      window[callbackName].stdout.emit("data", output);
      window[callbackName].emit("exit", 0);
    }, args[0] === "settings" && args[1] === "set" ? 20 : 0);
  },
};

await import("../module_data/webroot/app.js");
for (let attempt = 0; get("port-value").textContent !== "22"; attempt++) {
  assert.ok(attempt < 100, "initial settings did not load");
  await new Promise((resolve) => setTimeout(resolve, 5));
}

if (process.argv[2] === "stale") {
  await advanced.trigger("click");
  assert.match(get("config-editor").value, /PasswordAuthentication yes/);
  await home.trigger("click");
  get("password-auth").checked = false;
  await get("password-auth").trigger("change");
  await advanced.trigger("click");
  assert.match(get("config-editor").value, /PasswordAuthentication no/);
  await get("save-config").trigger("click");
  assert.match(config, /PasswordAuthentication no/, "Advanced restored stale password settings");
  get("config-editor").value += "# local draft\n";
  config = config.replace("Port 22", "Port 2222");
  await get("save-config").trigger("click");
  assert.match(config, /Port 2222/, "saving a draft overwrote an external change");
  assert.match(get("toast").textContent, /Configuration changed/);
} else if (process.argv[2] === "concurrent") {
  get("password-auth").checked = false;
  const first = get("password-auth").trigger("change");
  get("root-login").checked = false;
  const second = get("root-login").trigger("change");
  await Promise.all([first, second]);
  assert.equal(completedSets, 2);
  assert.match(config, /PasswordAuthentication no/, "password setting was lost");
  assert.match(config, /PermitRootLogin no/, "root setting was lost");
} else {
  assert.fail("choose stale or concurrent");
}

console.log(`webui app ${process.argv[2]} test passed`);
