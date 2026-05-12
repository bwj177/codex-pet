#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const runtimeDir = path.join(__dirname, "..", "runtime");
const tokenFile = path.join(runtimeDir, "auth-token");
const sessionId = process.env.CODEX_PET_SESSION_ID || "";
const status = process.argv[2] || "idle";
const summary = process.argv.slice(3).join(" ") || `Status changed to ${status}`;
const payload = JSON.stringify({
  status,
  summary,
  sessionId: sessionId || undefined,
  command: process.env.CODEX_PET_COMMAND || "petctl",
  tokens: Number(process.env.CODEX_PET_TOKENS || 0) || undefined,
  contextUsage: process.env.CODEX_PET_CONTEXT ? Number(process.env.CODEX_PET_CONTEXT) : undefined
});

const authToken = getAuthToken();
const params = new URLSearchParams();
params.set("token", authToken);
if (sessionId) params.set("session", sessionId);

const req = http.request(
  {
    hostname: process.env.CODEX_PET_HOST || "127.0.0.1",
    port: Number(process.env.CODEX_PET_PORT || 4177),
    path: `/api/state?${params.toString()}`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      "x-codex-pet-token": authToken
    }
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => {
      body += chunk;
    });
    res.on("end", () => {
      process.stdout.write(`${body}\n`);
      process.exit(res.statusCode >= 400 ? 1 : 0);
    });
  }
);

req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

req.write(payload);
req.end();

function getAuthToken() {
  if (process.env.CODEX_PET_AUTH_TOKEN) return process.env.CODEX_PET_AUTH_TOKEN;
  try {
    const stored = fs.readFileSync(tokenFile, "utf8").trim();
    if (stored) return stored;
  } catch {}
  throw new Error("Missing CODEX_PET_AUTH_TOKEN and runtime/auth-token");
}
