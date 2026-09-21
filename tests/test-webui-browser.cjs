const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const url = pathToFileURL(path.resolve(__dirname, "../module_data/webroot/index.html")).href;
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("#error-message").textContent.includes("KernelSU"));
    assert.equal(await page.locator("#service-toggle").isDisabled(), true);
    assert.equal(await page.locator("#refresh").isEnabled(), true);

    // Only Android's native bridge is simulated; the shipped scripts and DOM run unchanged.
    await page.evaluate(() => {
      window.testState = {
        running: false, fail: false, keys: { root: [], shell: [] },
        settings: { port: "22", autostart: "1", "password-auth": "1", "root-login": "keys" },
        config: "Port 22\nPasswordAuthentication yes\nPermitRootLogin prohibit-password\n",
      };
      window.ksu = {
        exec(command, options, callback) {
          const args = [...command.matchAll(/'([^']*)'/g)].map((match) => match[1]).slice(2);
          setTimeout(() => {
            const s = window.testState;
            let output = "";
            let error = "";
            if (s.fail) error = "Test write denied";
            else if (args[0] === "state") output = `state\t${s.running ? "running" : "stopped"}\nport\t${s.settings.port}\n`;
            else if (args[0] === "settings") {
              if (args[1] === "set") s.settings[args[2]] = args[3];
              else output = Object.entries(s.settings).map(([k, v]) => `${k}\t${v}`).join("\n");
            } else if (args[0] === "addresses") output = "192.168.1.42\n";
            else if (args[0] === "service") s.running = args[1] !== "stop";
            else if (args[0] === "log") output = "SSH started\n";
            else if (args[0] === "keys") {
              const keys = s.keys[args[2]];
              if (args[1] === "add") {
                if (atob(args[3]).startsWith("ssh-ed25519 ")) keys.push(args[3]);
                else error = "invalid public key";
              } else if (args[1] === "delete") s.keys[args[2]] = keys.filter((key) => key !== args[3]);
              else output = keys.map((key) => `key\t${key}\t${btoa("256 SHA256:abc laptop (ED25519)")}`).join("\n");
            } else if (args[0] === "config") {
              if (args[1] === "get") output = `config\t${btoa(s.config)}`;
              else if (atob(args[2]).includes("InvalidDirective")) error = "invalid sshd_config";
              else s.config = atob(args[2]);
            } else error = "Unexpected command";
            window[callback](error ? 1 : 0, output, error);
          }, 20);
        },
      };
    });
    const idle = () => page.waitForFunction(() => !document.querySelector("#refresh").disabled);
    await page.click("#refresh");
    await idle();
    assert.equal(await page.locator("#error-panel").isVisible(), false);
    assert.match(await page.locator("#connection-list").textContent(), /ssh -p 22 root@192.168.1.42/);
    await page.selectOption("#connection-user", "shell");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedCommand = text; } } }));
    await page.click(".connection-command button");
    assert.equal(await page.evaluate(() => window.copiedCommand), "ssh -p 22 shell@192.168.1.42");
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Clipboard blocked"); }; });
    await page.click(".connection-command button");
    assert.match(await page.evaluate(() => window.getSelection().toString()), /shell@192.168.1.42/);
    await page.click("#service-toggle");
    await idle();
    assert.equal(await page.locator("#service-title").textContent(), "SSH is running");
    await page.click("#service-restart");
    await idle();

    await page.evaluate(() => { window.testState.fail = true; });
    await page.uncheck("#autostart");
    await idle();
    assert.equal(await page.locator("#autostart").isChecked(), true);
    assert.match(await page.locator("#error-message").textContent(), /write denied/);
    await page.evaluate(() => { window.testState.fail = false; });

    await page.click("#port-row");
    await page.fill("#port-input", "2222");
    await page.click("#confirm-port");
    await idle();
    await page.waitForFunction(() => !document.querySelector("#port-dialog").open);
    assert.equal(await page.locator("#port-value").textContent(), "2222");
    assert.equal(await page.locator("#pending-settings").isVisible(), true);
    await page.evaluate(() => { window.testState.fail = true; });
    await page.click("#apply-settings");
    await idle();
    assert.equal(await page.locator("#pending-settings").isVisible(), true);
    await page.evaluate(() => { window.testState.fail = false; });
    await page.click("#apply-settings");
    await idle();
    assert.equal(await page.locator("#pending-settings").isVisible(), false);

    await page.click('[data-target="keys"]');
    await idle();
    await page.locator("#root-tab").press("ArrowRight");
    await idle();
    assert.equal(await page.locator("#shell-tab").getAttribute("aria-selected"), "true");
    await page.click("#root-tab");
    await idle();
    assert.equal(await page.locator("#keys-empty").isVisible(), true);
    await page.click("#add-first-key");
    await page.locator("#key-file").setInputFiles({ name: "private.pub", mimeType: "text/plain", buffer: Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----") });
    await page.waitForFunction(() => document.querySelector("#key-error").textContent.includes("private key"));
    await page.fill("#key-input", "bad key");
    await page.click("#confirm-key");
    await idle();
    assert.equal(await page.locator("#key-dialog").isVisible(), true);
    assert.match(await page.locator("#key-error").textContent(), /invalid public key/);
    await page.locator("#key-file").setInputFiles({ name: "id_ed25519.pub", mimeType: "text/plain", buffer: Buffer.from("ssh-ed25519 AAAA laptop") });
    await page.waitForFunction(() => document.querySelector("#key-input").value === "ssh-ed25519 AAAA laptop");
    await page.click("#confirm-key");
    await idle();
    assert.equal(await page.locator(".key-row").count(), 1);
    await page.click("#shell-tab");
    await idle();
    assert.equal(await page.locator(".key-row").count(), 0);
    await page.click("#root-tab");
    await idle();
    await page.click(".remove-key");
    await page.click('#confirm-dialog button[value="cancel"]');
    assert.equal(await page.locator(".key-row").count(), 1);
    await page.click(".remove-key");
    await page.click("#confirm-action");
    await page.waitForFunction(() => document.querySelectorAll(".key-row").length === 0);
    await idle();
    assert.equal(await page.locator(".key-row").count(), 0);

    await page.click('[data-target="advanced"]');
    await idle();
    await page.fill("#config-editor", "InvalidDirective yes");
    await page.click("#save-config");
    await idle();
    assert.match(await page.locator("#error-message").textContent(), /invalid sshd_config/);
    assert.equal(await page.locator("#config-editor").inputValue(), "InvalidDirective yes");
    await page.click('[data-target="home"]');
    await idle();
    await page.click("#port-row");
    await page.fill("#port-input", "2200");
    await page.click("#confirm-port");
    await page.waitForFunction(() => document.querySelector("#port-error").textContent.includes("configuration edits"));
    assert.equal(await page.evaluate(() => window.testState.settings.port), "2222");
    await page.click('#port-dialog button[value="cancel"]');
    await page.click('[data-target="advanced"]');
    await idle();
    assert.equal(await page.locator("#config-editor").inputValue(), "InvalidDirective yes");
    await page.click("#discard-config");
    await page.click("#confirm-action");
    await page.waitForFunction(() => document.querySelector("#config-status").textContent === "Saved");
    assert.match(await page.locator("#config-editor").inputValue(), /Port 22/);
    await page.fill("#config-editor", "Port 2222\n");
    await page.click("#save-config");
    await idle();
    assert.equal(await page.locator("#save-config").isDisabled(), true);
    assert.match(await page.locator("#service-log").textContent(), /SSH started/);

    await page.click('[data-target="home"]');
    await idle();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    }
    if (process.env.SCREENSHOT_DIR) {
      await page.waitForFunction(() => !document.querySelector("#toast").classList.contains("visible"));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "webui-light.png"), fullPage: true, animations: "disabled" });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "webui-dark.png"), fullPage: true, animations: "disabled" });
      await page.emulateMedia({ colorScheme: "light" });
      await page.click('[data-target="keys"]');
      await idle();
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "webui-keys.png"), fullPage: true, animations: "disabled" });
      await page.click('[data-target="advanced"]');
      await idle();
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "webui-advanced.png"), fullPage: true, animations: "disabled" });
    }
    assert.deepEqual(errors, []);
    console.log("WebUI browser checks passed: recovery, service, settings, keys, config, mobile and desktop");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
