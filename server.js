#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.CODEX_PET_PORT || 4177);
const host = process.env.CODEX_PET_HOST || "127.0.0.1";
const stateFile = process.env.CODEX_PET_STATE || path.join(root, "runtime", "session-state.json");

const clients = new Set();
let state = {
  status: "idle",
  contextUsage: 0.42,
  tokens: 18240,
  tokenSource: "simulated",
  contextSource: "simulated",
  model: "gpt-5.4",
  codexVersion: "unknown",
  codexPath: "unknown",
  sessionId: "global",
  privacyMode: "standard",
  summary: "Codex Pet runtime is online.",
  command: "node server.js",
  commandDisclosure: "redacted",
  cwd: process.cwd(),
  gitBranch: "none",
  changedFiles: ["server.js", "src/main.js"],
  updatedAt: new Date().toISOString()
};

function ensureRuntimeDir() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
}

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(stateFile)) {
      persistState();
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    state = normalizeState({ ...state, ...parsed });
  } catch (error) {
    state = normalizeState({
      ...state,
      status: "error",
      summary: `Failed to read runtime state: ${error.message}`
    });
  }
}

function persistState() {
  ensureRuntimeDir();
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function normalizeState(next) {
  return {
    ...next,
    contextUsage: clamp(Number(next.contextUsage ?? state.contextUsage), 0, 1),
    tokens: Math.max(0, Number(next.tokens ?? state.tokens) || 0),
    changedFiles: Array.isArray(next.changedFiles) ? next.changedFiles : [],
    updatedAt: new Date().toISOString()
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function broadcast() {
  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/state" && req.method === "GET") {
    sendJson(res, 200, state);
    return;
  }

  if (pathname === "/api/state" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const patch = body ? JSON.parse(body) : {};
      state = normalizeState({ ...state, ...patch });
      persistState();
      broadcast();
      sendJson(res, 200, state);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[ext] || "application/octet-stream";
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    res.end(content);
  });
}

ensureRuntimeDir();
loadStateFromDisk();

fs.watchFile(stateFile, { interval: 500 }, () => {
  loadStateFromDisk();
  broadcast();
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname === "/events") {
    handleEvents(req, res);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }

  serveStatic(res, decodeURIComponent(url.pathname));
});

server.listen(port, host, () => {
  console.log(`Codex Pet runtime: http://${host}:${port}`);
  console.log(`State file: ${stateFile}`);
});
