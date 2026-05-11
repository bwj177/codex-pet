#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const binDir = process.env.CODEX_PET_BIN_DIR || path.join(os.homedir(), ".local", "bin");
const target = path.join(binDir, "codex-pet");

try {
  const existing = fs.lstatSync(target);
  if (!existing.isSymbolicLink()) {
    throw new Error(`${target} exists but is not a symlink; refusing to remove it`);
  }
  fs.unlinkSync(target);
  console.log(`Removed ${target}`);
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(`${target} is not installed`);
  } else {
    throw error;
  }
}
