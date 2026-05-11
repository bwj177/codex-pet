#!/usr/bin/env node

const http = require("node:http");

const status = process.argv[2] || "idle";
const summary = process.argv.slice(3).join(" ") || `Status changed to ${status}`;
const payload = JSON.stringify({
  status,
  summary,
  command: process.env.CODEX_PET_COMMAND || "petctl",
  tokens: Number(process.env.CODEX_PET_TOKENS || 0) || undefined,
  contextUsage: process.env.CODEX_PET_CONTEXT ? Number(process.env.CODEX_PET_CONTEXT) : undefined
});

const req = http.request(
  {
    hostname: process.env.CODEX_PET_HOST || "127.0.0.1",
    port: Number(process.env.CODEX_PET_PORT || 4177),
    path: "/api/state",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload)
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
