#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "scripts", "codex-pet.js");
const binDir = process.env.CODEX_PET_BIN_DIR || path.join(os.homedir(), ".local", "bin");
const target = path.join(binDir, "codex-pet");

fs.mkdirSync(binDir, { recursive: true });
fs.chmodSync(source, 0o755);

try {
  const existing = fs.lstatSync(target);
  if (existing.isSymbolicLink()) {
    fs.unlinkSync(target);
  } else {
    throw new Error(`${target} already exists and is not a symlink`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

fs.symlinkSync(source, target);

console.log(`Installed codex-pet -> ${source}`);
console.log(`Target: ${target}`);
console.log("Run: codex-pet --status");
