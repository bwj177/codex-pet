#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "native", "macos", "CodexPetDesktop.swift");
const outDir = path.join(root, "dist", "macos");
const binary = path.join(outDir, "codex-pet-desktop");
const buildCache = path.join(root, "runtime", "build-cache");

if (process.platform !== "darwin") {
  console.error("The native desktop shell currently supports macOS only.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(buildCache, { recursive: true });
execFileSync("swiftc", [source, "-o", binary, "-framework", "AppKit", "-framework", "WebKit"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    CLANG_MODULE_CACHE_PATH: path.join(buildCache, "clang-module-cache"),
    SWIFT_MODULE_CACHE_PATH: path.join(buildCache, "swift-module-cache")
  }
});
fs.chmodSync(binary, 0o755);
console.log(`Built ${binary}`);
