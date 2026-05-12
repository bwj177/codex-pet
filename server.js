#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const runtimeDir = path.join(root, "runtime");
const sessionsDir = path.join(runtimeDir, "sessions");
const legacyStateFile = path.join(runtimeDir, "session-state.json");
const activeSessionFile = path.join(runtimeDir, "active-session");
const port = Number(process.env.CODEX_PET_PORT || 4177);
const host = process.env.CODEX_PET_HOST || "127.0.0.1";
const tokenFile = path.join(runtimeDir, "auth-token");

const sessionClients = new Map();
const sessionStateCache = new Map();
let authToken = "";

function createDefaultState(sessionId) {
  return {
    status: "idle",
    contextUsage: 0.42,
    tokens: 18240,
    tokenSource: "simulated",
    contextSource: "simulated",
    model: "gpt-5.4",
    codexVersion: "unknown",
    codexPath: "unknown",
    sessionId,
    privacyMode: "standard",
    summary: "Codex Pet runtime is online.",
    command: "node server.js",
    commandDisclosure: "redacted",
    cwd: process.cwd(),
    gitBranch: "none",
    changedFiles: ["server.js", "src/main.js"],
    updatedAt: new Date().toISOString()
  };
}

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
}

function loadOrCreateAuthToken() {
  try {
    const stored = fs.readFileSync(tokenFile, "utf8").trim();
    if (stored) return stored;
  } catch {}

  return process.env.CODEX_PET_AUTH_TOKEN || crypto.randomBytes(24).toString("hex");
}

function persistAuthToken() {
  ensureRuntimeDir();
  fs.writeFileSync(tokenFile, `${authToken}\n`, { mode: 0o600 });
}

function sanitizeSessionId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "global";
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "global";
}

function getActiveSessionId() {
  try {
    const stored = fs.readFileSync(activeSessionFile, "utf8").trim();
    if (stored) return sanitizeSessionId(stored);
  } catch {}
  return "global";
}

function persistActiveSessionId(sessionId) {
  ensureRuntimeDir();
  fs.writeFileSync(activeSessionFile, `${sessionId}\n`, { mode: 0o600 });
}

function getSessionFile(sessionId) {
  return path.join(sessionsDir, `${sanitizeSessionId(sessionId)}.json`);
}

function normalizeState(next, previous) {
  return {
    ...next,
    sessionId: sanitizeSessionId(next.sessionId || previous.sessionId || "global"),
    contextUsage: clamp(Number(next.contextUsage ?? previous.contextUsage), 0, 1),
    tokens: Math.max(0, Number(next.tokens ?? previous.tokens) || 0),
    changedFiles: Array.isArray(next.changedFiles) ? next.changedFiles : [],
    updatedAt: new Date().toISOString()
  };
}

function loadLegacyState() {
  try {
    if (!fs.existsSync(legacyStateFile)) return null;
    return JSON.parse(fs.readFileSync(legacyStateFile, "utf8"));
  } catch {
    return null;
  }
}

function loadSessionState(sessionId) {
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (sessionStateCache.has(normalizedSessionId)) {
    return sessionStateCache.get(normalizedSessionId);
  }

  const sessionFile = getSessionFile(normalizedSessionId);
  const fallback = createDefaultState(normalizedSessionId);

  try {
    if (fs.existsSync(sessionFile)) {
      const parsed = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
      const state = normalizeState({ ...fallback, ...parsed, sessionId: normalizedSessionId }, fallback);
      sessionStateCache.set(normalizedSessionId, state);
      return state;
    }
  } catch (error) {
    const broken = normalizeState(
      {
        ...fallback,
        status: "error",
        summary: `Failed to read runtime state: ${error.message}`
      },
      fallback
    );
    sessionStateCache.set(normalizedSessionId, broken);
    return broken;
  }

  const legacy = loadLegacyState();
  const initial = normalizeState(
    legacy ? { ...fallback, ...legacy, sessionId: normalizedSessionId } : fallback,
    fallback
  );
  sessionStateCache.set(normalizedSessionId, initial);
  persistSessionState(normalizedSessionId, initial);
  return initial;
}

function persistSessionState(sessionId, state) {
  ensureRuntimeDir();
  const normalizedSessionId = sanitizeSessionId(sessionId);
  const normalizedState = normalizeState({ ...state, sessionId: normalizedSessionId }, createDefaultState(normalizedSessionId));
  fs.writeFileSync(getSessionFile(normalizedSessionId), `${JSON.stringify(normalizedState, null, 2)}\n`);
  sessionStateCache.set(normalizedSessionId, normalizedState);
  persistActiveSessionId(normalizedSessionId);
  return normalizedState;
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

function isAuthorized(req, url) {
  const headerToken = req.headers["x-codex-pet-token"];
  const queryToken = url.searchParams.get("token");
  return headerToken === authToken || queryToken === authToken;
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

function resolveSessionId(url, patch) {
  return sanitizeSessionId(url.searchParams.get("session") || patch?.sessionId || getActiveSessionId());
}

function broadcast(sessionId, state) {
  const clients = sessionClients.get(sessionId);
  if (!clients || clients.size === 0) return;

  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function handleEvents(req, res, sessionId) {
  const state = loadSessionState(sessionId);
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);

  let clients = sessionClients.get(sessionId);
  if (!clients) {
    clients = new Set();
    sessionClients.set(sessionId, clients);
  }
  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
    if (clients.size === 0) sessionClients.delete(sessionId);
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/api/state" && req.method === "GET") {
    const sessionId = resolveSessionId(url);
    sendJson(res, 200, loadSessionState(sessionId));
    return;
  }

  if (pathname === "/api/state" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const patch = body ? JSON.parse(body) : {};
      const sessionId = resolveSessionId(url, patch);
      const current = loadSessionState(sessionId);
      const next = persistSessionState(sessionId, { ...current, ...patch, sessionId });
      broadcast(sessionId, next);
      sendJson(res, 200, next);
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
authToken = loadOrCreateAuthToken();
persistAuthToken();
loadSessionState(getActiveSessionId());

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname === "/events") {
    if (!isAuthorized(req, url)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    handleEvents(req, res, resolveSessionId(url));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!isAuthorized(req, url)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    await handleApi(req, res, url);
    return;
  }

  serveStatic(res, decodeURIComponent(url.pathname));
});

server.listen(port, host, () => {
  console.log(`Codex Pet runtime: http://${host}:${port}`);
  console.log(`Sessions dir: ${sessionsDir}`);
});
