// spawn() bridge adapted from kernelsu-alt 3.1.2 by KOWX712.
// Derived from KernelSU and vendored under Apache-2.0; see LICENSE-kernelsu.txt.
let callbackCounter = 0;
function getUniqueCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
}

export function isKsuWebui() {
  return typeof globalThis.ksu !== "undefined";
}

export function exec(command, options) {
  if (typeof options === "undefined") options = {};
  return new Promise((resolve, reject) => {
    const name = getUniqueCallbackName("exec");
    window[name] = (errno, stdout, stderr) => {
      resolve({ errno, stdout, stderr });
      delete window[name];
    };
    if (!isKsuWebui()) {
      resolve({ errno: 1, stdout: "", stderr: "ksu is not defined" });
      delete window[name];
      return;
    }
    try { ksu.exec(command, JSON.stringify(options), name); }
    catch (error) { reject(error); delete window[name]; }
  });
}

function Stdio() { this.listeners = {}; }
Stdio.prototype.on = function (event, listener) {
  if (!this.listeners[event]) this.listeners[event] = [];
  this.listeners[event].push(listener);
};
Stdio.prototype.emit = function (event, ...args) {
  if (this.listeners[event]) this.listeners[event].forEach((listener) => listener(...args));
};

function ChildProcess() {
  this.listeners = {};
  this.stdin = new Stdio();
  this.stdout = new Stdio();
  this.stderr = new Stdio();
}
ChildProcess.prototype.on = Stdio.prototype.on;
ChildProcess.prototype.emit = Stdio.prototype.emit;

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function spawn(command, args, options) {
  if (typeof args === "undefined") args = [];
  else if (!(args instanceof Array)) { options = args; args = []; }
  if (typeof options === "undefined") options = {};
  const child = new ChildProcess();
  const name = getUniqueCallbackName("spawn");
  window[name] = child;
  child.on("exit", () => { delete window[name]; });
  if (!isKsuWebui()) {
    setTimeout(() => {
      child.stderr.emit("data", "ksu is not defined");
      child.emit("exit", 1);
    }, 0);
    return child;
  }
  if (typeof ksu.spawn !== "function" && typeof ksu.exec === "function") {
    const commandLine = [command, ...args].map(shellQuote).join(" ");
    window[name] = (errno, stdout, stderr) => {
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
      child.emit("exit", errno);
    };
    try { ksu.exec(commandLine, JSON.stringify(options), name); }
    catch (error) {
      setTimeout(() => {
        child.emit("error", error);
        delete window[name];
      }, 0);
    }
    return child;
  }
  try { ksu.spawn(command, JSON.stringify(args), JSON.stringify(options), name); }
  catch (error) {
    setTimeout(() => {
      child.emit("error", error);
      delete window[name];
    }, 0);
  }
  return child;
}

export function fullScreen(value) { ksu.fullScreen(value); }
export function enableEdgeToEdge(value) { ksu.enableEdgeToEdge(value); }
export function toast(message) {
  if (isKsuWebui()) ksu.toast(message);
  else console.log(message);
}
export function moduleInfo() { return ksu.moduleInfo(); }
export function listPackages(type) {
  try { return JSON.parse(ksu.listPackages(type)); } catch (_) { return []; }
}
export function getPackagesInfo(packages) {
  try {
    if (typeof packages !== "string") packages = JSON.stringify(packages);
    return JSON.parse(ksu.getPackagesInfo(packages));
  } catch (_) { return []; }
}
export function exit() { ksu.exit(); }
