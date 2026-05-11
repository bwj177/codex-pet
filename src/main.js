const petProfile = {
  name: "Mochi",
  personality: "calm reviewer",
  catchphrases: {
    idle: "I am watching the workspace.",
    hover: "Need the session panel?",
    tap_head: "Head pat registered.",
    drag: "Repositioning.",
    thinking: "Thinking through the next move.",
    running_command: "Command is running.",
    error: "Something failed. Logs first.",
    success: "Checks are green.",
    waiting_user: "Codex is waiting for you.",
    context_high: "Context is getting full."
  }
};

const skinStorageKey = "codex-pet.skin.v1";
const petLibraryUrl = "./assets/pets/library.json";
const maxSkinImageBytes = 2.8 * 1024 * 1024;
const defaultSkin = {
  name: "Mochi",
  preset: "mochi",
  mode: "procedural",
  body: "#65d6c8",
  bodyDark: "#34aebc",
  head: "#f4b45f",
  headLight: "#f9d973",
  accent: "#f0a256",
  outline: "#222832",
  eye: "#222832",
  eyeBg: "#fffaf0",
  cheek: "rgba(228, 92, 92, 0.38)",
  scale: 100,
  eyes: "round",
  ears: true,
  tail: true,
  showParts: true,
  imageSrc: "",
  imageName: "",
  libraryAssetId: "",
  imageSource: "",
  imageLicense: "",
  imageFit: "contain",
  imageScale: 100,
  imageOffsetX: 0,
  imageOffsetY: 0
};

const skinPresets = {
  mochi: defaultSkin,
  terminal: {
    ...defaultSkin,
    name: "Bit",
    preset: "terminal",
    body: "#55e6a5",
    bodyDark: "#1c9b6b",
    head: "#1f2937",
    headLight: "#374151",
    accent: "#b7f64a",
    outline: "#0b1020",
    eye: "#afff5a",
    eyeBg: "#111827",
    cheek: "rgba(85, 230, 165, 0.25)",
    eyes: "spark"
  },
  ember: {
    ...defaultSkin,
    name: "Ember",
    preset: "ember",
    body: "#ff9b6a",
    bodyDark: "#d95d39",
    head: "#ffd166",
    headLight: "#ffe29a",
    accent: "#ef476f",
    outline: "#352218",
    eye: "#352218",
    cheek: "rgba(239, 71, 111, 0.34)"
  },
  cloud: {
    ...defaultSkin,
    name: "Cloud",
    preset: "cloud",
    body: "#a8c7ff",
    bodyDark: "#7396d8",
    head: "#edf4ff",
    headLight: "#ffffff",
    accent: "#8a7cff",
    outline: "#2a3448",
    eye: "#2a3448",
    cheek: "rgba(138, 124, 255, 0.28)",
    eyes: "calm"
  }
};

const state = {
  status: "idle",
  mood: "neutral",
  contextUsage: 0.42,
  tokens: 18240,
  startedAt: Date.now(),
  model: "gpt-5.4",
  codexVersion: "unknown",
  codexPath: "unknown",
  sessionId: "global",
  privacyMode: "standard",
  sandboxMode: "unknown",
  approvalPolicy: "unknown",
  tokenSource: "simulated",
  contextSource: "simulated",
  summary: "Waiting for Codex activity.",
  command: "none",
  commandDisclosure: "redacted",
  cwd: "",
  gitBranch: "none",
  changedFiles: ["index.html", "src/main.js", "src/styles.css"],
  position: { x: 96, y: 220 },
  dragging: false,
  dragOffset: { x: 0, y: 0 },
  panelOpen: true
};

let skin = loadSkin();
let petLibrary = [];

const desktopMode = new URLSearchParams(window.location.search).get("desktop") === "1";
const runtimeToken = new URLSearchParams(window.location.search).get("token") || "";
if (desktopMode) {
  document.documentElement.classList.add("desktop-mode");
  state.position = { x: 24, y: 210 };
  state.panelOpen = false;
}

const nativeWindow = window.webkit?.messageHandlers?.petWindow;

const behaviorRules = [
  {
    status: "running_command",
    mood: "focused",
    badge: "RUN",
    summary: "Codex is executing a command and watching output.",
    command: "npm run verify",
    contextDelta: 0.02,
    tokenDelta: 740
  },
  {
    status: "thinking",
    mood: "thinking",
    badge: "...",
    summary: "Codex is planning the implementation path.",
    command: "none",
    contextDelta: 0.01,
    tokenDelta: 380
  },
  {
    status: "error",
    mood: "alert",
    badge: "ERR",
    summary: "The last action failed. The pet recommends checking the shortest failing log first.",
    command: "npm run test",
    contextDelta: 0.015,
    tokenDelta: 520
  },
  {
    status: "success",
    mood: "happy",
    badge: "OK",
    summary: "The latest verification passed.",
    command: "npm run build",
    contextDelta: 0.01,
    tokenDelta: 260
  },
  {
    status: "waiting_user",
    mood: "waiting",
    badge: "ASK",
    summary: "Codex needs user input or approval before continuing.",
    command: "approval required",
    contextDelta: 0,
    tokenDelta: 80
  }
];

const dom = {
  pet: document.querySelector("#pet"),
  petStage: document.querySelector("#petStage"),
  speech: document.querySelector("#speech"),
  panel: document.querySelector("#panel"),
  closePanel: document.querySelector("#closePanel"),
  petName: document.querySelector("#petName"),
  sessionState: document.querySelector("#sessionState"),
  contextMeter: document.querySelector("#contextMeter"),
  contextUsage: document.querySelector("#contextUsage"),
  tokenUsage: document.querySelector("#tokenUsage"),
  modelName: document.querySelector("#modelName"),
  runtime: document.querySelector("#runtime"),
  gitBranch: document.querySelector("#gitBranch"),
  changedCount: document.querySelector("#changedCount"),
  summary: document.querySelector("#summary"),
  workspacePath: document.querySelector("#workspacePath"),
  recentCommand: document.querySelector("#recentCommand"),
  sessionId: document.querySelector("#sessionId"),
  codexVersion: document.querySelector("#codexVersion"),
  sandboxMode: document.querySelector("#sandboxMode"),
  approvalPolicy: document.querySelector("#approvalPolicy"),
  privacyMode: document.querySelector("#privacyMode"),
  usageSource: document.querySelector("#usageSource"),
  changedFiles: document.querySelector("#changedFiles"),
  statusBadge: document.querySelector("#statusBadge"),
  skinImage: document.querySelector("#skinImage"),
  skinName: document.querySelector("#skinName"),
  skinMode: document.querySelector("#skinMode"),
  skinPreset: document.querySelector("#skinPreset"),
  skinBody: document.querySelector("#skinBody"),
  skinHead: document.querySelector("#skinHead"),
  skinAccent: document.querySelector("#skinAccent"),
  skinOutline: document.querySelector("#skinOutline"),
  skinScale: document.querySelector("#skinScale"),
  skinEyes: document.querySelector("#skinEyes"),
  skinImageFit: document.querySelector("#skinImageFit"),
  skinLibraryAsset: document.querySelector("#skinLibraryAsset"),
  skinImageScale: document.querySelector("#skinImageScale"),
  skinImageOffsetX: document.querySelector("#skinImageOffsetX"),
  skinImageOffsetY: document.querySelector("#skinImageOffsetY"),
  skinEars: document.querySelector("#skinEars"),
  skinTail: document.querySelector("#skinTail"),
  skinShowParts: document.querySelector("#skinShowParts"),
  skinImageFile: document.querySelector("#skinImageFile"),
  copySkin: document.querySelector("#copySkin"),
  clearSkinImage: document.querySelector("#clearSkinImage"),
  resetSkin: document.querySelector("#resetSkin")
};

class LayeredPetModel {
  constructor(root) {
    this.root = root;
  }

  play(animation) {
    this.root.dataset.animation = animation;
  }

  setMood(mood) {
    this.root.dataset.mood = mood;
  }

  lookAt(clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (clientX - rect.left - rect.width / 2) / 120));
    const y = Math.max(-1, Math.min(1, (clientY - rect.top - rect.height / 2) / 120));
    this.root.style.setProperty("--look-x", `${x * 8}px`);
    this.root.style.setProperty("--look-y", `${y * 5}px`);
    this.root.style.setProperty("--tilt", `${x * 4}deg`);
  }
}

const petModel = new LayeredPetModel(dom.pet);

function connectRuntime() {
  const stateUrl = withRuntimeToken("/api/state");
  fetch(stateUrl)
    .then((response) => (response.ok ? response.json() : null))
    .then((nextState) => {
      if (nextState) updateFromRuntime(nextState);
    })
    .catch(() => {
      speak("Static mode. Runtime is not connected.");
    });

  if (!("EventSource" in window)) return;

  const events = new EventSource(withRuntimeToken("/events"));
  events.addEventListener("state", (event) => {
    updateFromRuntime(JSON.parse(event.data));
  });
  events.addEventListener("error", () => {
    dom.sessionState.textContent = "Runtime Reconnecting";
  });
}

function withRuntimeToken(pathname) {
  if (!runtimeToken) return pathname;
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}token=${encodeURIComponent(runtimeToken)}`;
}

function updateFromRuntime(nextState) {
  const previousStatus = state.status;
  Object.assign(state, nextState);
  if (nextState.status && nextState.status !== previousStatus) {
    applyBehavior(nextState.status, { preserveRuntime: true });
  } else {
    renderPanel();
  }
}

function applyBehavior(status, options = {}) {
  const rule = behaviorRules.find((item) => item.status === status);
  state.status = status;

  if (rule) {
    state.mood = rule.mood;
    if (!options.preserveRuntime) {
      state.summary = rule.summary;
      state.command = rule.command;
      state.contextUsage = Math.min(0.96, state.contextUsage + rule.contextDelta);
      state.tokens += rule.tokenDelta;
    }
    dom.statusBadge.textContent = rule.badge;
  } else {
    state.mood = "neutral";
    dom.statusBadge.textContent = "";
  }

  if (state.contextUsage > 0.84 && status !== "error") {
    state.mood = "tired";
    dom.statusBadge.textContent = "CTX";
    speak(petProfile.catchphrases.context_high);
  } else {
    speak(petProfile.catchphrases[status] || petProfile.catchphrases.idle);
  }

  petModel.play(status);
  petModel.setMood(state.mood);
  renderPanel();
}

function renderPanel() {
  dom.petName.textContent = skin.name || petProfile.name;
  dom.sessionState.textContent = toTitle(state.status);
  dom.contextMeter.style.width = `${Math.round(state.contextUsage * 100)}%`;
  dom.contextUsage.textContent = `${Math.round(state.contextUsage * 100)}%`;
  dom.tokenUsage.textContent = compactNumber(state.tokens);
  dom.modelName.textContent = state.model;
  dom.gitBranch.textContent = state.gitBranch || "none";
  dom.changedCount.textContent = String(state.changedFiles.length);
  dom.summary.textContent = state.summary;
  dom.workspacePath.textContent = state.cwd || "unknown";
  dom.recentCommand.textContent = state.commandDisclosure === "redacted" ? `${state.command} (redacted)` : state.command;
  dom.sessionId.textContent = state.sessionId || "global";
  dom.codexVersion.textContent = state.codexVersion || "unknown";
  dom.sandboxMode.textContent = state.sandboxMode || "unknown";
  dom.approvalPolicy.textContent = state.approvalPolicy || "unknown";
  dom.privacyMode.textContent = state.privacyMode || "standard";
  dom.usageSource.textContent = `tokens:${state.tokenSource || "unknown"} context:${state.contextSource || "unknown"}`;
  dom.changedFiles.replaceChildren(
    ...state.changedFiles.map((file) => {
      const li = document.createElement("li");
      li.textContent = file;
      return li;
    })
  );
  dom.runtime.textContent = formatDuration(Date.now() - state.startedAt);
  dom.panel.classList.toggle("open", state.panelOpen);
}

function loadSkin() {
  try {
    const stored = JSON.parse(localStorage.getItem(skinStorageKey));
    return normalizeSkin(stored);
  } catch {
    return { ...defaultSkin };
  }
}

function normalizeSkin(nextSkin = {}) {
  const mode = nextSkin.mode === "image" ? "image" : "procedural";
  const imageFit = nextSkin.imageFit === "cover" ? "cover" : "contain";
  return {
    ...defaultSkin,
    ...nextSkin,
    mode,
    imageFit,
    scale: Math.max(85, Math.min(125, Number(nextSkin.scale || defaultSkin.scale))),
    imageScale: Math.max(70, Math.min(150, Number(nextSkin.imageScale || defaultSkin.imageScale))),
    imageOffsetX: Math.max(-60, Math.min(60, Number(nextSkin.imageOffsetX || defaultSkin.imageOffsetX))),
    imageOffsetY: Math.max(-60, Math.min(60, Number(nextSkin.imageOffsetY || defaultSkin.imageOffsetY))),
    ears: nextSkin.ears !== false,
    tail: nextSkin.tail !== false,
    showParts: nextSkin.showParts !== false,
    imageSrc: typeof nextSkin.imageSrc === "string" ? nextSkin.imageSrc : "",
    imageName: typeof nextSkin.imageName === "string" ? nextSkin.imageName : "",
    libraryAssetId: typeof nextSkin.libraryAssetId === "string" ? nextSkin.libraryAssetId : "",
    imageSource: typeof nextSkin.imageSource === "string" ? nextSkin.imageSource : "",
    imageLicense: typeof nextSkin.imageLicense === "string" ? nextSkin.imageLicense : ""
  };
}

function saveSkin() {
  try {
    localStorage.setItem(skinStorageKey, JSON.stringify(skin, null, 2));
  } catch {
    speak("Skin is too large to persist.");
  }
}

function applySkin() {
  const root = document.documentElement;
  root.style.setProperty("--pet-body", skin.body);
  root.style.setProperty("--pet-body-dark", skin.bodyDark);
  root.style.setProperty("--pet-head", skin.head);
  root.style.setProperty("--pet-head-light", skin.headLight);
  root.style.setProperty("--pet-accent", skin.accent);
  root.style.setProperty("--pet-outline", skin.outline);
  root.style.setProperty("--pet-eye", skin.eye);
  root.style.setProperty("--pet-eye-bg", skin.eyeBg);
  root.style.setProperty("--pet-cheek", skin.cheek);
  root.style.setProperty("--pet-scale", String(skin.scale / 100));
  root.style.setProperty("--pet-image-scale", String(skin.imageScale / 100));
  root.style.setProperty("--pet-image-x", `${skin.imageOffsetX}px`);
  root.style.setProperty("--pet-image-y", `${skin.imageOffsetY}px`);
  dom.skinImage.src = skin.imageSrc || "";
  dom.skinImage.alt = skin.imageName ? `${skin.name || "Pet"} skin image: ${skin.imageName}` : "";
  dom.pet.dataset.skinMode = skin.mode;
  dom.pet.dataset.ears = String(skin.ears);
  dom.pet.dataset.tail = String(skin.tail);
  dom.pet.dataset.eyes = skin.eyes;
  dom.pet.dataset.imageFit = skin.imageFit;
  dom.pet.dataset.showParts = String(skin.mode !== "image" || skin.showParts);
  syncSkinControls();
  renderPanel();
}

function syncSkinControls() {
  dom.skinName.value = skin.name;
  dom.skinMode.value = skin.mode;
  dom.skinPreset.value = skin.preset;
  dom.skinBody.value = skin.body;
  dom.skinHead.value = skin.head;
  dom.skinAccent.value = skin.accent;
  dom.skinOutline.value = skin.outline;
  dom.skinScale.value = String(skin.scale);
  dom.skinEyes.value = skin.eyes;
  dom.skinImageFit.value = skin.imageFit;
  dom.skinLibraryAsset.value = skin.libraryAssetId;
  dom.skinImageScale.value = String(skin.imageScale);
  dom.skinImageOffsetX.value = String(skin.imageOffsetX);
  dom.skinImageOffsetY.value = String(skin.imageOffsetY);
  dom.skinEars.checked = skin.ears;
  dom.skinTail.checked = skin.tail;
  dom.skinShowParts.checked = skin.showParts;
  dom.clearSkinImage.disabled = !skin.imageSrc;
}

function updateSkin(patch) {
  skin = normalizeSkin({ ...skin, ...patch });
  saveSkin();
  applySkin();
}

function bindSkinControls() {
  dom.skinName.addEventListener("input", () => updateSkin({ name: dom.skinName.value || defaultSkin.name }));
  dom.skinMode.addEventListener("change", () => updateSkin({ mode: dom.skinMode.value }));
  dom.skinBody.addEventListener("input", () => updateSkin({ body: dom.skinBody.value, bodyDark: shadeColor(dom.skinBody.value, -18) }));
  dom.skinHead.addEventListener("input", () => updateSkin({ head: dom.skinHead.value, headLight: shadeColor(dom.skinHead.value, 24) }));
  dom.skinAccent.addEventListener("input", () => updateSkin({ accent: dom.skinAccent.value }));
  dom.skinOutline.addEventListener("input", () => updateSkin({ outline: dom.skinOutline.value, eye: dom.skinOutline.value }));
  dom.skinScale.addEventListener("input", () => updateSkin({ scale: Number(dom.skinScale.value) }));
  dom.skinEyes.addEventListener("change", () => updateSkin({ eyes: dom.skinEyes.value }));
  dom.skinImageFit.addEventListener("change", () => updateSkin({ imageFit: dom.skinImageFit.value }));
  dom.skinLibraryAsset.addEventListener("change", () => selectLibraryAsset(dom.skinLibraryAsset.value));
  dom.skinImageScale.addEventListener("input", () => updateSkin({ imageScale: Number(dom.skinImageScale.value) }));
  dom.skinImageOffsetX.addEventListener("input", () => updateSkin({ imageOffsetX: Number(dom.skinImageOffsetX.value) }));
  dom.skinImageOffsetY.addEventListener("input", () => updateSkin({ imageOffsetY: Number(dom.skinImageOffsetY.value) }));
  dom.skinEars.addEventListener("change", () => updateSkin({ ears: dom.skinEars.checked }));
  dom.skinTail.addEventListener("change", () => updateSkin({ tail: dom.skinTail.checked }));
  dom.skinShowParts.addEventListener("change", () => updateSkin({ showParts: dom.skinShowParts.checked }));
  dom.skinImageFile.addEventListener("change", () => importSkinImage(dom.skinImageFile.files?.[0]));
  dom.skinPreset.addEventListener("change", () => updateSkin({ ...skinPresets[dom.skinPreset.value], preset: dom.skinPreset.value }));
  dom.clearSkinImage.addEventListener("click", () =>
    updateSkin({ mode: "procedural", imageSrc: "", imageName: "", libraryAssetId: "", imageSource: "", imageLicense: "" })
  );
  dom.resetSkin.addEventListener("click", () => updateSkin({ ...defaultSkin }));
  dom.copySkin.addEventListener("click", () => copySkinJson());
}

function loadPetLibrary() {
  fetch(petLibraryUrl)
    .then((response) => (response.ok ? response.json() : null))
    .then((manifest) => {
      petLibrary = Array.isArray(manifest?.assets) ? manifest.assets : [];
      renderPetLibraryOptions();
    })
    .catch(() => {
      petLibrary = [];
      renderPetLibraryOptions();
    });
}

function renderPetLibraryOptions() {
  const options = [
    new Option("None", ""),
    ...petLibrary.map((asset) => new Option(`${asset.name} (${asset.license})`, asset.id))
  ];
  dom.skinLibraryAsset.replaceChildren(...options);
  dom.skinLibraryAsset.value = skin.libraryAssetId;
}

function selectLibraryAsset(assetId) {
  if (!assetId) {
    updateSkin({ libraryAssetId: "" });
    return;
  }
  const asset = petLibrary.find((item) => item.id === assetId);
  if (!asset) {
    speak("Built-in pet unavailable.");
    return;
  }
  updateSkin({
    name: asset.name.replace(/^Kenney /, "").replace(/^OpenGameArt /, ""),
    mode: "image",
    imageSrc: asset.src,
    imageName: asset.name,
    libraryAssetId: asset.id,
    imageSource: asset.source,
    imageLicense: asset.license,
    imageFit: "contain",
    imageScale: 112,
    imageOffsetX: 0,
    imageOffsetY: 0,
    showParts: false
  });
  speak(`${asset.name} selected.`);
}

function importSkinImage(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    speak("Choose an image file.");
    dom.skinImageFile.value = "";
    return;
  }
  if (file.size > maxSkinImageBytes) {
    speak("Image is too large.");
    dom.skinImageFile.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    updateSkin({
      mode: "image",
      imageSrc: String(reader.result || ""),
      imageName: file.name,
      libraryAssetId: "",
      imageSource: "local file",
      imageLicense: "",
      imageFit: skin.imageFit || "contain",
      showParts: false
    });
    speak("Role image imported.");
    dom.skinImageFile.value = "";
  });
  reader.addEventListener("error", () => {
    speak("Image import failed.");
    dom.skinImageFile.value = "";
  });
  reader.readAsDataURL(file);
}

function copySkinJson() {
  const text = JSON.stringify(skin, null, 2);
  if (!navigator.clipboard?.writeText) {
    speak("Clipboard unavailable.");
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => speak("Skin JSON copied."),
    () => speak("Clipboard unavailable.")
  );
}

function shadeColor(hex, percent) {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized, 16);
  const amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (value >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (value & 0x0000ff) + amount));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function speak(text) {
  dom.speech.textContent = text;
  dom.speech.classList.add("show");
  window.clearTimeout(speak.timer);
  speak.timer = window.setTimeout(() => dom.speech.classList.remove("show"), 2600);
}

function toTitle(value) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactNumber(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function movePet(x, y) {
  const maxX = window.innerWidth - 230;
  const maxY = window.innerHeight - 240;
  state.position.x = Math.max(12, Math.min(maxX, x));
  state.position.y = Math.max(12, Math.min(maxY, y));
  dom.pet.style.transform = `translate3d(${state.position.x}px, ${state.position.y}px, 0)`;
}

function moveNativeWindow(dx, dy) {
  if (!nativeWindow) return false;
  nativeWindow.postMessage({ type: "dragBy", dx, dy });
  return true;
}

function openPanel() {
  state.panelOpen = true;
  renderPanel();
}

function closePanel() {
  state.panelOpen = false;
  renderPanel();
}

dom.pet.addEventListener("pointerdown", (event) => {
  const rect = dom.pet.getBoundingClientRect();
  state.dragging = true;
  state.dragOffset.x = event.clientX - rect.left;
  state.dragOffset.y = event.clientY - rect.top;
  state.lastScreenX = event.screenX;
  state.lastScreenY = event.screenY;
  dom.pet.setPointerCapture(event.pointerId);
  applyBehavior("drag");
});

dom.pet.addEventListener("pointermove", (event) => {
  petModel.lookAt(event.clientX, event.clientY);
  if (state.dragging) {
    if (desktopMode && nativeWindow) {
      moveNativeWindow(event.screenX - state.lastScreenX, event.screenY - state.lastScreenY);
      state.lastScreenX = event.screenX;
      state.lastScreenY = event.screenY;
    } else {
      movePet(event.clientX - state.dragOffset.x, event.clientY - state.dragOffset.y);
    }
  }
});

dom.pet.addEventListener("pointerup", (event) => {
  state.dragging = false;
  dom.pet.releasePointerCapture(event.pointerId);
  applyBehavior("idle");
});

dom.pet.addEventListener("mouseenter", (event) => {
  petModel.lookAt(event.clientX, event.clientY);
  speak(petProfile.catchphrases.hover);
});

dom.pet.addEventListener("dblclick", () => {
  openPanel();
  applyBehavior("tap_head");
});

dom.pet.addEventListener("click", (event) => {
  if (state.dragging) return;
  const rect = dom.petStage.getBoundingClientRect();
  const isHead = event.clientY < rect.top + rect.height * 0.42;
  if (isHead) {
    speak(petProfile.catchphrases.tap_head);
    petModel.play("tap_head");
  } else {
    openPanel();
  }
});

dom.closePanel.addEventListener("click", closePanel);

document.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => applyBehavior(button.dataset.status));
});

window.addEventListener("mousemove", (event) => petModel.lookAt(event.clientX, event.clientY));
window.addEventListener("resize", () => movePet(state.position.x, state.position.y));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (desktopMode && nativeWindow && !state.panelOpen) {
      nativeWindow.postMessage({ type: "close" });
    } else {
      closePanel();
    }
  }
  if (event.key === "p") openPanel();
  if (event.key === " ") applyBehavior("thinking");
});

window.codexPet = {
  update(nextState) {
    Object.assign(state, nextState);
    if (nextState.status) applyBehavior(nextState.status);
    renderPanel();
  },
  profile: petProfile
};

movePet(state.position.x, state.position.y);
bindSkinControls();
applySkin();
applyBehavior("idle");
renderPanel();
loadPetLibrary();
connectRuntime();
window.setInterval(renderPanel, 1000);

window.setInterval(() => {
  if (state.status === "idle" && !state.panelOpen) {
    const statuses = ["thinking", "running_command", "waiting_user", "success"];
    applyBehavior(statuses[Math.floor(Math.random() * statuses.length)]);
    window.setTimeout(() => applyBehavior("idle"), 3200);
  }
}, 11000);
