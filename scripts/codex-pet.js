#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const runtimeDir = path.join(root, "runtime");
const serverLog = path.join(runtimeDir, "server.log");
const host = process.env.CODEX_PET_HOST || "127.0.0.1";
const port = Number(process.env.CODEX_PET_PORT || 4177);
const baseUrl = `http://${host}:${port}`;
const sessionId = process.env.CODEX_PET_SESSION_ID || makeSessionId();

const options = {
  open: true,
  desktop: true,
  petOnly: false,
  statusOnly: false,
  privacyMode: process.env.CODEX_PET_PRIVACY || "standard",
  codexArgs: []
};

for (const arg of process.argv.slice(2)) {
  if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  }
  if (arg === "--no-open") {
    options.open = false;
    continue;
  }
  if (arg === "--browser") {
    options.desktop = false;
    continue;
  }
  if (arg === "--pet-only") {
    options.petOnly = true;
    continue;
  }
  if (arg === "--status") {
    options.statusOnly = true;
    continue;
  }
  if (arg.startsWith("--privacy=")) {
    options.privacyMode = arg.slice("--privacy=".length) || "standard";
    continue;
  }
  options.codexArgs.push(arg);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(runtimeDir, { recursive: true });

  const online = await isRuntimeOnline();
  if (!online) {
    startRuntime();
    await waitForRuntime();
  }

  if (options.statusOnly) {
    const state = await getState();
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (options.open) {
    openPetWindow();
  }

  if (options.petOnly) {
    await postState({
      status: "idle",
      summary: "Codex Pet is running without launching Codex.",
      command: "codex-pet --pet-only"
    });
    console.log(`Codex Pet: ${baseUrl}`);
    return;
  }

  await runCodex();
}

function printHelp() {
  console.log(`Codex Pet launcher

Usage:
  codex-pet [codex args...]
  codex-pet --pet-only
  codex-pet --status

Options:
  --pet-only   Start the pet runtime and open the pet, but do not launch Codex.
  --no-open    Do not open the pet page/window.
  --browser    Open the browser UI instead of the native desktop pet window.
  --privacy    Metadata disclosure level: standard or verbose.
  --status     Print the current pet runtime state.
  --help       Show this help.

Examples:
  codex-pet
  codex-pet --pet-only
  codex-pet --no-open exec "summarize this repo"
`);
}

function requestJson(method, pathname, payload) {
  const body = payload ? JSON.stringify(payload) : "";
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: host,
        port,
        path: pathname,
        method,
        timeout: 1200,
        headers: body
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(body)
            }
          : undefined
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Runtime returned HTTP ${res.statusCode}: ${responseBody}`));
            return;
          }
          try {
            resolve(responseBody ? JSON.parse(responseBody) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Runtime request timed out"));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function isRuntimeOnline() {
  try {
    await requestJson("GET", "/api/state");
    return true;
  } catch {
    return false;
  }
}

function getState() {
  return requestJson("GET", "/api/state");
}

function postState(patch) {
  return requestJson("POST", "/api/state", {
    ...getCodexMetadata(),
    ...getWorkspaceSnapshot(),
    ...patch,
    sessionId,
    privacyMode: normalizePrivacyMode(options.privacyMode),
    disclosurePolicy: getDisclosurePolicy(),
    cwd: process.cwd(),
    launcherPid: process.pid
  });
}

function makeSessionId() {
  const safeCwd = process.cwd().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-32) || "workspace";
  return `${safeCwd}-${Date.now().toString(36)}-${process.pid}`;
}

function normalizePrivacyMode(value) {
  return value === "verbose" ? "verbose" : "standard";
}

function getDisclosurePolicy() {
  const privacyMode = normalizePrivacyMode(options.privacyMode);
  return {
    promptText: privacyMode === "verbose" ? "visible" : "redacted",
    envVars: "hidden",
    diffContent: "hidden",
    changedFiles: "paths-only",
    tokenUsage: "simulated-until-codex-events-available",
    contextUsage: "simulated-until-codex-events-available"
  };
}

function getWorkspaceSnapshot() {
  const snapshot = {
    cwd: process.cwd(),
    gitBranch: "none",
    changedFiles: []
  };

  try {
    snapshot.gitBranch = runGit(["branch", "--show-current"]) || runGit(["rev-parse", "--short", "HEAD"]);
    snapshot.changedFiles = runGit(["status", "--short"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^.. ?/, ""))
      .slice(0, 12);
  } catch {
    return snapshot;
  }

  return snapshot;
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1200
  }).trim();
}

function getCodexMetadata() {
  const codexCommand = process.env.CODEX_PET_CODEX_BIN || "codex";
  return {
    codexPath: findCommandPath(codexCommand),
    codexVersion: getCommandOutput(codexCommand, ["--version"]) || "unknown",
    model: readCodexConfigValue("model") || "codex-default",
    approvalPolicy: readCodexConfigValue("approval_policy") || process.env.CODEX_APPROVAL_POLICY || "unknown",
    sandboxMode: readCodexConfigValue("sandbox_mode") || process.env.CODEX_SANDBOX_MODE || "unknown",
    tokenSource: "simulated",
    contextSource: "simulated"
  };
}

function findCommandPath(command) {
  if (command.includes("/")) return command;
  return getCommandOutput("which", [command]) || "unknown";
}

function getCommandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1200
    }).trim();
  } catch {
    return "";
  }
}

function readCodexConfigValue(key) {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  try {
    const content = fs.readFileSync(configPath, "utf8");
    const match = content.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']?([^"'\\n#]+)["']?`, "m"));
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCommandPreview(codexCommand, args) {
  if (normalizePrivacyMode(options.privacyMode) === "verbose") {
    return [codexCommand, ...args].join(" ");
  }

  if (args.length === 0) return codexCommand;
  const first = args[0];
  if (first === "exec") return `${codexCommand} exec [prompt redacted]`;
  return `${codexCommand} ${first} [${Math.max(args.length - 1, 0)} arg(s) redacted]`;
}

function startRuntime() {
  const out = fs.openSync(serverLog, "a");
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      CODEX_PET_HOST: host,
      CODEX_PET_PORT: String(port)
    }
  });
  child.unref();
}

async function waitForRuntime() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    if (await isRuntimeOnline()) return;
    await sleep(180);
  }
  throw new Error(`Codex Pet runtime did not start. Check ${serverLog}`);
}

function openPetWindow() {
  if (options.desktop && process.platform === "darwin") {
    openDesktopPet();
    return;
  }

  const commands = {
    darwin: ["open", [`${baseUrl}/?desktop=1`]],
    win32: ["cmd", ["/c", "start", "", baseUrl]],
    linux: ["xdg-open", [baseUrl]]
  };
  const command = commands[process.platform];
  if (!command) return;

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {});
  child.unref();
}

function openDesktopPet() {
  const binary = path.join(root, "dist", "macos", "codex-pet-desktop");
  if (!fs.existsSync(binary)) {
    const build = spawn(process.execPath, [path.join(root, "scripts", "build-desktop.js")], {
      cwd: root,
      detached: false,
      stdio: "ignore",
      env: process.env
    });
    build.on("exit", (code) => {
      if (code === 0) spawnDesktop(binary);
      else openBrowserFallback();
    });
    return;
  }
  spawnDesktop(binary);
}

function spawnDesktop(binary) {
  const child = spawn(binary, [`${baseUrl}/?desktop=1`], {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", openBrowserFallback);
  child.unref();
}

function openBrowserFallback() {
  const child = spawn("open", [`${baseUrl}/?desktop=1`], {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {});
  child.unref();
}

async function runCodex() {
  const codexCommand = process.env.CODEX_PET_CODEX_BIN || "codex";
  const args = options.codexArgs;
  const commandText = buildCommandPreview(codexCommand, args);

  await postState({
    status: "running_command",
    summary: "Codex launched from Codex Pet.",
    command: commandText,
    commandDisclosure: normalizePrivacyMode(options.privacyMode) === "verbose" ? "full" : "redacted"
  });

  const startedAt = Date.now();
  const observer = setInterval(() => {
    postState({
      status: "running_command",
      summary: "Codex is running. Workspace changes are being watched.",
      command: commandText,
      commandDisclosure: normalizePrivacyMode(options.privacyMode) === "verbose" ? "full" : "redacted"
    }).catch(() => {});
  }, 3000);

  const child = spawn(codexCommand, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      CODEX_PET_URL: baseUrl
    }
  });

  child.on("error", async (error) => {
    clearInterval(observer);
    await postState({
      status: "error",
      summary: `Failed to launch Codex: ${error.message}`,
      command: commandText,
      commandDisclosure: normalizePrivacyMode(options.privacyMode) === "verbose" ? "full" : "redacted"
    });
    process.exit(1);
  });

  child.on("exit", async (code, signal) => {
    clearInterval(observer);
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const ok = code === 0;
    await postState({
      status: ok ? "success" : "error",
      summary: ok
        ? `Codex exited successfully after ${durationSeconds}s.`
        : `Codex exited with ${signal || `code ${code}`} after ${durationSeconds}s.`,
      command: commandText,
      commandDisclosure: normalizePrivacyMode(options.privacyMode) === "verbose" ? "full" : "redacted"
    });
    process.exit(code ?? 1);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
