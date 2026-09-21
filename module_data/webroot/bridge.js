"use strict";

const SSHBridge = (() => {
  let sequence = 0;
  const quote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";

  function moduleDir() {
    try {
      const info = JSON.parse(window.ksu.moduleInfo());
      if (/^\/data\/adb\/modules(?:_update)?\/[\w.-]+$/.test(info.moduleDir)) return info.moduleDir;
    } catch (_) { /* Older managers do not expose moduleInfo. */ }
    return "/data/adb/modules/ksu-ssh";
  }

  function run(args) {
    return new Promise((resolve, reject) => {
      if (!window.ksu || typeof window.ksu.exec !== "function") {
        reject(new Error("Open this page in the KernelSU or APatch module WebUI."));
        return;
      }
      const name = `ssh_callback_${Date.now()}_${sequence++}`;
      const timer = setTimeout(() => {
        delete window[name];
        reject(new Error("No response from the root command. Refresh before trying again."));
      }, 15000);
      window[name] = (errno, stdout, stderr) => {
        clearTimeout(timer);
        delete window[name];
        if (Number(errno) === 0) resolve(String(stdout || ""));
        else reject(new Error(String(stderr || stdout || `Command failed (${errno})`).trim()));
      };
      const command = ["sh", `${moduleDir()}/common/ksu-ssh-webui`, ...args].map(quote).join(" ");
      try {
        window.ksu.exec(command, "{}", name);
      } catch (error) {
        clearTimeout(timer);
        delete window[name];
        reject(error);
      }
    });
  }

  return { run };
})();
