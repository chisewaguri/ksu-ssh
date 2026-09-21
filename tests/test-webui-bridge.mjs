import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../module_data/webroot/bridge.js", import.meta.url), "utf8");
let timeout;
let command;
let callback;
const context = vm.createContext({
  setTimeout: (fn) => { timeout = fn; return 1; },
  clearTimeout: () => { timeout = null; },
});
context.window = context;
vm.runInContext(source, context);
const run = vm.runInContext("SSHBridge.run", context);
await assert.rejects(run(["state"]), /KernelSU or APatch/);
context.ksu = {
  exec: (cmd, options, name) => {
    assert.equal(options, "{}");
    command = cmd;
    callback = name;
  },
  moduleInfo: () => JSON.stringify({ moduleDir: "/data/adb/modules/ksu-ssh" }),
  spawn: () => { throw new Error("spawn must not be used"); },
};

let result = run(["keys", "add", "root", "a'b; $(bad)"]);
assert.equal(command, "'sh' '/data/adb/modules/ksu-ssh/common/ksu-ssh-webui' 'keys' 'add' 'root' 'a'\\''b; $(bad)'");
context[callback](0, "saved", "");
assert.equal(await result, "saved");
assert.equal(context[callback], undefined);
assert.equal(timeout, null);

result = run(["state"]);
context[callback](1, "", "permission denied");
await assert.rejects(result, /permission denied/);

delete context.ksu.moduleInfo;
result = run(["state"]);
assert.match(command, /\/modules\/ksu-ssh\/common/);
context[callback]("0", "state\trunning\n", "");
assert.equal(await result, "state\trunning\n");

context.ksu.moduleInfo = () => JSON.stringify({ moduleDir: "/data/adb/modules_update/ksu-ssh" });
result = run(["state"]);
assert.match(command, /modules_update/);
timeout();
await assert.rejects(result, /No response/);
assert.equal(context[callback], undefined);

context.ksu.exec = () => { throw new Error("bridge unavailable"); };
await assert.rejects(run(["state"]), /bridge unavailable/);
assert.equal(timeout, null);
assert.equal(Object.keys(context).filter((key) => key.startsWith("ssh_callback_")).length, 0);
console.log("WebUI bridge tests passed");
