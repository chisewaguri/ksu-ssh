import assert from "node:assert/strict";
import { spawn } from "../module_data/webroot/vendor/kernelsu.js";

globalThis.window = globalThis;

globalThis.ksu = {
  spawn(command, encodedArgs, encodedOptions, callbackName) {
    assert.equal(command, "/data/adb/ssh/bin/ksu-ssh-webui");
    assert.deepEqual(JSON.parse(encodedArgs), ["settings", "set", "autostart", "1"]);
    assert.deepEqual(JSON.parse(encodedOptions), {});
    setTimeout(() => {
      window[callbackName].stdout.emit("data", "ok\n");
      window[callbackName].emit("exit", "0");
    }, 0);
  },
};

await new Promise((resolve, reject) => {
  const child = spawn("/data/adb/ssh/bin/ksu-ssh-webui", ["settings", "set", "autostart", "1"]);
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.on("error", reject);
  child.on("exit", (code) => {
    try {
      assert.equal(Number(code), 0);
      assert.equal(output, "ok\n");
      resolve();
    } catch (error) { reject(error); }
  });
});

globalThis.ksu = {
  exec(command, encodedOptions, callbackName) {
    assert.equal(
      command,
      "'/data/adb/ssh/bin/ksu-ssh-webui' 'settings' 'set' 'autostart' '1'",
    );
    assert.deepEqual(JSON.parse(encodedOptions), {});
    setTimeout(() => window[callbackName](0, "ok from exec\n", ""), 0);
  },
};

await new Promise((resolve, reject) => {
  const child = spawn("/data/adb/ssh/bin/ksu-ssh-webui", ["settings", "set", "autostart", "1"]);
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.on("error", reject);
  child.on("exit", (code) => {
    try {
      assert.equal(Number(code), 0);
      assert.equal(output, "ok from exec\n");
      resolve();
    } catch (error) { reject(error); }
  });
});

delete globalThis.ksu;

await new Promise((resolve, reject) => {
  const child = spawn("missing");
  let error = "";
  child.stderr.on("data", (data) => { error += data; });
  child.on("exit", (code) => {
    try {
      assert.equal(code, 1);
      assert.equal(error, "ksu is not defined");
      resolve();
    } catch (failure) { reject(failure); }
  });
});

console.log("webui bridge tests passed");
