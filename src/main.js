import { Reactor } from "@reactor-team/js-sdk";
import "./style.css";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const MODEL_ID = "reactor/cosmos3-nano-sim-bimanual";
const TOKENS_URL = "https://api.reactor.inc/tokens";
const PRICE_PER_MIN = 0.102;
const SESSION_LIMIT = 300;
const STOP_AT = 292;
const ARM_LIMIT = 0.18;
const DEFAULT_PROMPT = "Move both robot arms carefully over the table.";
const DEFAULT_IMAGE = "./agibot.png";

const PRESETS = [
  { label: "Cup to bin", prompt: "Pick up the white cup and place it in the black bin." },
  { label: "Fold cloth", prompt: "Fold the orange cloth on the table with both arms." },
  { label: "Hover reach", prompt: "Move both robot arms carefully over the table and pause above the cup." },
  { label: "Sweep paper", prompt: "Use the right arm to push the crumpled paper toward the black bin." },
];

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const els = {
  stage: $("#stage"),
  video: $("#worldVideo"),
  preview: $("#scenePreview"),
  startOverlay: $("#startOverlay"),
  endedOverlay: $("#endedOverlay"),
  endedEyebrow: $("#endedEyebrow"),
  endedTitle: $("#endedTitle"),
  endedCopy: $("#endedCopy"),
  startBtn: $("#startBtn"),
  startLabel: $("#startLabel"),
  restartBtn: $("#restartBtn"),
  startError: $("#startError"),
  statusChip: $("#statusChip"),
  statusText: $("#statusText"),
  resolutionReadout: $("#resolutionReadout"),
  stepReadout: $("#stepReadout"),
  clientFps: $("#clientFps"),
  sessionReadout: $("#sessionReadout"),
  latencyReadout: $("#latencyReadout"),
  leftHudPos: $("#leftHudPos"),
  rightHudPos: $("#rightHudPos"),
  leftHudGrip: $("#leftHudGrip"),
  rightHudGrip: $("#rightHudGrip"),
  pauseBtn: $("#pauseBtn"),
  resetBtn: $("#resetBtn"),
  recenterBtn: $("#recenterBtn"),
  snapBtn: $("#snapBtn"),
  recordBtn: $("#recordBtn"),
  stopBtn: $("#stopBtn"),
  pointerHelp: $("#pointerHelp"),
  handsHelp: $("#handsHelp"),
  gamepadHelp: $("#gamepadHelp"),
  padX: $("#padX"),
  padY: $("#padY"),
  padZ: $("#padZ"),
  cameraVideo: $("#cameraVideo"),
  handCanvas: $("#handCanvas"),
  cameraIdle: $("#cameraIdle"),
  cameraBtn: $("#cameraBtn"),
  neutralBtn: $("#neutralBtn"),
  swapHandsBtn: $("#swapHandsBtn"),
  handStatus: $("#handStatus"),
  gamepadStatus: $("#gamepadStatus"),
  lx: $("#lx"),
  ly: $("#ly"),
  rx: $("#rx"),
  ry: $("#ry"),
  promptInput: $("#promptInput"),
  presets: $("#presets"),
  seedInput: $("#seedInput"),
  applyBtn: $("#applyBtn"),
  imageBtn: $("#imageBtn"),
  imageInput: $("#imageInput"),
  imageName: $("#imageName"),
  worldState: $("#worldState"),
  sessionState: $("#sessionState"),
  elapsed: $("#elapsed"),
  spend: $("#spend"),
  stepStat: $("#stepStat"),
  frameStat: $("#frameStat"),
  sessionProgress: $("#sessionProgress"),
  leftPanel: $("#leftPanel"),
  rightPanel: $("#rightPanel"),
  leftPad: $("#leftPad"),
  rightPad: $("#rightPad"),
  leftDot: $("#leftDot"),
  rightDot: $("#rightDot"),
  leftZ: $("#leftZ"),
  rightZ: $("#rightZ"),
  leftZOut: $("#leftZOut"),
  rightZOut: $("#rightZOut"),
  leftGrip: $("#leftGrip"),
  rightGrip: $("#rightGrip"),
  leftGripOut: $("#leftGripOut"),
  rightGripOut: $("#rightGripOut"),
  toast: $("#toast"),
  aboutDialog: $("#aboutDialog"),
  aboutBtn: $("#aboutBtn"),
  startAboutBtn: $("#startAboutBtn"),
  closeAbout: $("#closeAbout"),
  dialogDone: $("#dialogDone"),
  keyBtn: $("#keyBtn"),
  keyLabel: $("#keyLabel"),
  keyDialog: $("#keyDialog"),
  keyForm: $("#keyForm"),
  apiKeyInput: $("#apiKeyInput"),
  toggleKey: $("#toggleKey"),
  keyError: $("#keyError"),
  keySubmit: $("#keySubmit"),
  keySubmitLabel: $("#keySubmitLabel"),
  forgetKey: $("#forgetKey"),
  closeKey: $("#closeKey"),
};

const app = {
  reactor: null,
  apiKey: "",
  startAfterKey: false,
  status: "idle",
  message: "",
  error: "",
  starting: false,
  stopping: false,
  sessionOpen: false,
  ready: false,
  paused: false,
  sessionStart: 0,
  finalElapsed: 0,
  autoStopTimer: 0,
  endedReason: "stopped",
  lastPrompt: DEFAULT_PROMPT,
  startImage: null,
  startImageName: "agibot.png",
  startImageUrl: "",
  defaultImage: null,
  imageBusy: false,
  controls: blankControls(),
  selected: "left",
  mode: "pointer",
  pointerDrag: null,
  controlTimer: 0,
  controlInFlight: false,
  controlDirty: false,
  controlTimes: [],
  step: 0,
  frameIndex: 0,
  sim: {},
  frames: {
    hasFrame: false,
    count: 0,
    times: [],
    width: 0,
    height: 0,
    callbackId: 0,
    looping: false,
    sampleCanvas: null,
  },
  lastStatsAt: 0,
  lastPauseToggleAt: 0,
  poster: "",
  hands: {
    stream: null,
    landmarker: null,
    enabled: false,
    loading: false,
    lastVideoTime: -1,
    current: [],
    neutral: null,
    neutralTimer: 0,
    swap: false,
    smooth: { left: null, right: null },
    grip: { left: 0, right: 0 },
  },
  gamepad: { connected: false, name: "", prevButtons: [], lastTime: 0 },
  recording: { active: false, recorder: null, chunks: [], mime: "" },
  toastTimer: 0,
  bootTimer: 0,
};

function blankControls() {
  return {
    left: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
    right: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
    left_grip: 0,
    right_grip: 0,
  };
}

function normalizeControls(raw) {
  const next = blankControls();
  if (!raw || typeof raw !== "object") return next;
  for (const arm of ["left", "right"]) {
    const source = raw[arm];
    if (!source || typeof source !== "object") continue;
    if (Array.isArray(source.position) && source.position.length >= 3) {
      next[arm].position = source.position.slice(0, 3).map((value) => clamp(Number(value) || 0, -0.25, 0.25));
    }
    if (Array.isArray(source.orientation) && source.orientation.length >= 4) {
      const quat = source.orientation.slice(0, 4).map((value) => Number(value) || 0);
      const norm = Math.hypot(...quat);
      if (norm > 1e-6) next[arm].orientation = quat.map((value) => value / norm);
    }
  }
  next.left_grip = clamp(Number(raw.left_grip) || 0, 0, 1);
  next.right_grip = clamp(Number(raw.right_grip) || 0, 0, 1);
  return next;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function fmt(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function fmtClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function stamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select") || target.isContentEditable;
}

function showToast(text, tone = "") {
  clearTimeout(app.toastTimer);
  els.toast.textContent = text;
  els.toast.className = `toast is-visible${tone === "error" ? " is-error" : ""}`;
  app.toastTimer = window.setTimeout(() => {
    els.toast.className = "toast";
  }, 4400);
}

function currentElapsed() {
  if (!app.sessionOpen || !app.sessionStart) return Math.max(0, app.finalElapsed);
  return Math.max(0, (performance.now() - app.sessionStart) / 1000);
}

function currentPrompt() {
  return els.promptInput.value.trim().slice(0, 800) || DEFAULT_PROMPT;
}

function currentSeed() {
  return clamp(Number.parseInt(els.seedInput.value, 10) || 42, 0, 2147483647);
}

function errorText(error) {
  if (!error) return "The world could not start.";
  if (typeof error === "string") return error;
  const message = error.message || String(error);
  const code = error.code && !message.includes(error.code) ? `${error.code}: ` : "";
  return `${code}${message}`.slice(0, 500);
}

function isAuthError(error) {
  const status = Number(error?.status);
  if (status === 401 || status === 403) return true;
  return /unauthorized|forbidden|invalid api key|api key|401|403/i.test(errorText(error));
}

function setStatus(status, message = "") {
  app.status = status;
  app.message = message;
  updateUI();
}

function updateKeyUI() {
  const hasKey = Boolean(app.apiKey);
  els.keyBtn.classList.toggle("has-key", hasKey);
  els.keyLabel.textContent = hasKey ? "Key loaded" : "Add API key";
  els.keyBtn.title = hasKey ? "A Reactor key is loaded in this tab" : "Add your Reactor API key";
}

function openKeyDialog(startAfter = false) {
  app.startAfterKey = startAfter;
  els.keyError.textContent = "";
  els.apiKeyInput.value = "";
  els.apiKeyInput.type = "password";
  els.toggleKey.textContent = "Show";
  els.apiKeyInput.placeholder = app.apiKey ? "Key loaded — paste a new one to replace" : "rk_...";
  if (!els.keyDialog.open) els.keyDialog.showModal();
  window.setTimeout(() => els.apiKeyInput.focus(), 60);
}

function closeKeyDialog() {
  if (els.keyDialog.open) els.keyDialog.close();
  els.apiKeyInput.value = "";
  app.startAfterKey = false;
}

function updateUI() {
  const status = app.status;
  const live = status === "live" || status === "paused";
  const warming = status === "warming" || status === "ending";

  els.stage.classList.toggle("is-live", live);
  els.stage.classList.toggle("is-warming", warming);
  els.stage.classList.toggle("is-ended", status === "ended");
  els.stage.classList.toggle("is-pointer", app.mode === "pointer");
  els.stage.classList.toggle("has-frame", app.frames.hasFrame);
  els.endedOverlay.hidden = status !== "ended";

  const labels = {
    idle: ["Idle", "is-idle"],
    connecting: ["Connecting", "is-warm"],
    warming: ["Warming", "is-warm"],
    live: ["Live", "is-live"],
    paused: ["Paused", "is-paused"],
    ending: ["Closing", "is-warm"],
    ended: ["Closed", "is-idle"],
    error: ["Error", "is-error"],
  };
  const [label, chipClass] = labels[status] || labels.idle;
  els.statusText.textContent = label;
  els.statusChip.className = `status-chip ${chipClass}`;
  els.worldState.textContent = status;
  els.sessionState.textContent = app.ready
    ? (app.paused ? "paused" : "live")
    : app.sessionOpen
      ? "connecting"
      : status === "ended"
        ? "closed"
        : "not started";

  const busyLabel = status === "connecting"
    ? "Connecting to B200…"
    : status === "warming" || status === "ending"
      ? (status === "ending" ? "Closing…" : "Warming up…")
      : "Start world";
  els.startLabel.textContent = busyLabel;
  els.startBtn.disabled = app.starting || app.sessionOpen;

  els.pauseBtn.disabled = !(status === "live" || status === "paused");
  els.pauseBtn.textContent = app.paused ? "Resume" : "Pause";
  els.resetBtn.disabled = !app.sessionOpen;
  els.recenterBtn.disabled = !app.sessionOpen;
  els.stopBtn.disabled = !app.sessionOpen;
  els.applyBtn.disabled = !app.ready;
  els.imageBtn.disabled = app.imageBusy || app.starting;
  els.snapBtn.disabled = !app.frames.hasFrame;
  els.recordBtn.disabled = !app.frames.hasFrame || !app.sessionOpen;

  els.stepReadout.textContent = `step ${String(app.step).padStart(3, "0")}`;
  els.stepStat.textContent = String(app.step);
  els.frameStat.textContent = String(app.frameIndex || app.frames.count || 0);
  els.resolutionReadout.textContent = app.frames.width ? `${app.frames.width}×${app.frames.height}` : "—";
  els.latencyReadout.textContent = app.ready ? "webrtc live" : app.sessionOpen ? "connecting" : "browser link";

  if (app.error && status === "error") {
    els.startError.textContent = app.error;
  } else if (status !== "connecting" && status !== "warming") {
    els.startError.textContent = "";
  }
}

function setStartBusy() {
  updateUI();
}

function flashBoot() {
  clearTimeout(app.bootTimer);
  els.stage.classList.add("booting");
  app.bootTimer = window.setTimeout(() => els.stage.classList.remove("booting"), 1250);
}

function showEnded(reason) {
  const copy = {
    limit: ["Session limit", "Five minutes, well spent.", "The B200 session closed at the five-minute cap. Start a new world to keep exploring from the same starting frame."],
    stopped: ["Session ended", "World closed.", "The GPU session ended. The last generated frame stays here until you start again."],
    "connection lost": ["Connection lost", "The world stopped.", "The Reactor stream disconnected. Start a new world to reconnect to the checkpoint."],
    error: ["Session failed", "The world stopped.", "Reactor closed the session after an error. Start again when you are ready."],
  };
  const [eyebrow, title, note] = copy[reason] || copy.stopped;
  els.endedEyebrow.textContent = eyebrow;
  els.endedTitle.textContent = title;
  els.endedCopy.textContent = note;
  els.endedOverlay.hidden = false;
  els.stage.classList.add("is-ended");
  if (app.recording.active) stopRecording();
}

function clearVideo() {
  if (app.frames.callbackId && els.video.cancelVideoFrameCallback) {
    try { els.video.cancelVideoFrameCallback(app.frames.callbackId); } catch {}
  }
  app.frames.callbackId = 0;
  app.frames.looping = false;
  app.frames.hasFrame = false;
  app.frames.count = 0;
  app.frames.times = [];
  app.frames.width = 0;
  app.frames.height = 0;
  try {
    els.video.pause();
    els.video.srcObject = null;
  } catch {}
  els.clientFps.textContent = "0.0 fps";
  els.snapBtn.disabled = true;
  els.recordBtn.disabled = true;
  if (app.recording.active) stopRecording();
  updateUI();
}

function resetForStart() {
  clearVideo();
  clearTimeout(app.autoStopTimer);
  app.autoStopTimer = 0;
  app.error = "";
  app.message = "";
  app.finalElapsed = 0;
  app.step = 0;
  app.frameIndex = 0;
  app.sim = {};
  app.paused = false;
  app.ready = false;
  app.lastStatsAt = 0;
  app.lastPauseToggleAt = 0;
  app.lastPrompt = currentPrompt();
  els.stage.classList.remove("has-frame", "is-live", "is-warming", "is-ended");
  els.endedOverlay.hidden = true;
  els.startOverlay.hidden = false;
  els.startError.textContent = "";
  app.poster = "";
  els.preview.src = app.startImageUrl || DEFAULT_IMAGE;
  els.stepReadout.textContent = "step 000";
  els.stepStat.textContent = "0";
  els.frameStat.textContent = "0";
  els.resolutionReadout.textContent = "—";
  els.clientFps.textContent = "0.0 fps";
  els.latencyReadout.textContent = "browser link";
  els.pauseBtn.textContent = "Pause";
}

async function fetchDefaultImage() {
  if (app.defaultImage) return app.defaultImage;
  const response = await fetch(DEFAULT_IMAGE, { cache: "force-cache" });
  if (!response.ok) throw new Error("Could not load the default AgiBot frame.");
  app.defaultImage = await response.blob();
  return app.defaultImage;
}

function asFile(blob, name) {
  if (blob instanceof File) return blob;
  return new File([blob], name || "agibot.png", { type: blob.type || "image/png" });
}

async function mintToken() {
  const response = await fetch(TOKENS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Reactor-API-Key": app.apiKey,
    },
    body: JSON.stringify({
      authorization_details: [{
        type: "session",
        resources: { models: { match: [MODEL_ID] } },
        constraints: {
          max_sessions: 1,
          max_session_duration_seconds: SESSION_LIMIT,
        },
      }],
      expires_after: 900,
    }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const detail = payload?.error || payload?.message || `Reactor returned HTTP ${response.status}.`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  if (!payload || typeof payload.jwt !== "string" || !payload.jwt) {
    throw new Error("Reactor returned no session token.");
  }
  return payload;
}

function bindReactor(reactor) {
  reactor.on("statusChanged", (status) => {
    if (status === "waiting") {
      if (app.sessionOpen) setStatus("warming", "Waiting for a B200…");
      return;
    }
    if (status === "ready") {
      app.ready = true;
      if (app.status !== "live" && app.status !== "paused") setStatus("warming", "World is warming up");
      updateUI();
      return;
    }
    if (status === "disconnected" && app.sessionOpen && !app.stopping && !app.starting) {
      endFromRemote();
    }
  });

  reactor.on("trackReceived", (name, track, stream) => {
    if (name !== "main_video") return;
    app.frames.times = [];
    app.frames.count = 0;
    app.frames.hasFrame = false;
    els.stage.classList.remove("has-frame");
    els.video.srcObject = stream;
    els.video.play().catch(() => {});
    track.addEventListener("ended", () => {
      if (app.sessionOpen && !app.stopping) endFromRemote();
    });
    startVideoMetrics();
  });

  reactor.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "simulation_status" && message.data && typeof message.data === "object") {
      app.sim = message.data;
      if (Number.isFinite(Number(message.data.step_index))) app.step = Number(message.data.step_index);
      if (Number.isFinite(Number(message.data.frame_index))) app.frameIndex = Number(message.data.frame_index);
      if (typeof message.data.paused === "boolean" && performance.now() - app.lastPauseToggleAt > 3000) {
        app.paused = message.data.paused;
      }
      if (app.ready && app.frames.hasFrame) {
        app.status = app.paused ? "paused" : "live";
      }
      updateUI();
    } else if (message.type === "error") {
      const data = message.data;
      showToast(typeof data === "string" ? data : "The model reported an error.", "error");
    }
  });

  reactor.on("error", (error) => {
    if (app.stopping || app.starting || !app.sessionOpen) return;
    if (!app.ready) {
      app.error = errorText(error);
      setStatus("error");
      return;
    }
    showToast(errorText(error), "error");
  });

  reactor.on("statsUpdate", (stats) => {
    if (!app.ready || !stats) return;
    if (typeof stats.framesPerSecond === "number" && stats.framesPerSecond > 0) {
      app.lastStatsAt = performance.now();
      els.clientFps.textContent = `${stats.framesPerSecond.toFixed(1)} fps`;
    }
  });
}

async function initializeWorld() {
  const reactor = app.reactor;
  if (!reactor) throw new Error("The Reactor client is not connected.");
  const blob = app.startImage || await fetchDefaultImage();
  const file = asFile(blob, app.startImageName || "agibot.png");
  const ref = await reactor.uploadFile(file);
  await reactor.sendCommand("set_image", { image: ref });
  await reactor.sendCommand("set_seed", { seed: currentSeed() });
  await reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
  const prompt = currentPrompt();
  await reactor.sendCommand("set_prompt", { prompt });
  app.lastPrompt = prompt;
}

async function beginSession() {
  if (app.starting || app.sessionOpen) return;
  if (!app.apiKey) {
    openKeyDialog(true);
    return;
  }
  app.starting = true;
  app.stopping = false;
  app.error = "";
  resetForStart();
  setStatus("connecting", "Authorizing with Reactor…");
  setStartBusy();

  try {
    const token = await mintToken();
    if (app.stopping) return;
    app.sessionStart = performance.now();
    app.sessionOpen = true;
    app.autoStopTimer = window.setTimeout(() => {
      if (app.sessionOpen && !app.stopping) stopWorld("limit");
    }, STOP_AT * 1000);

    const reactor = new Reactor({ modelName: MODEL_ID, logLevel: "warn" });
    app.reactor = reactor;
    bindReactor(reactor);
    setStatus("connecting", "Connecting to B200…");
    updateUI();
    await reactor.connect(token.jwt, { maxAttempts: 20 });
    if (!app.sessionOpen || app.stopping) return;
    app.ready = true;
    setStatus("warming", "Preparing the scene…");
    await initializeWorld();
    if (!app.sessionOpen || app.stopping) return;
    setStatus("warming", "World is warming up");
  } catch (error) {
    app.finalElapsed = currentElapsed();
    app.sessionOpen = false;
    app.ready = false;
    clearTimeout(app.autoStopTimer);
    app.autoStopTimer = 0;
    const reactor = app.reactor;
    app.reactor = null;
    if (reactor) {
      try { await reactor.disconnect(); } catch {}
    }
    const auth = isAuthError(error);
    if (auth) {
      if (Number(error?.status) === 401) {
        app.apiKey = "";
        updateKeyUI();
      }
      app.error = "";
      setStatus("idle");
      openKeyDialog(true);
      els.keyError.textContent = Number(error?.status) === 403
        ? "That key is valid but cannot access this model."
        : "Reactor rejected that key. Check it and try again.";
    } else {
      app.error = errorText(error);
      setStatus("error");
    }
  } finally {
    app.starting = false;
    updateUI();
  }
}

async function endFromRemote() {
  if (!app.sessionOpen || app.stopping) return;
  app.stopping = true;
  app.poster = capturePoster();
  app.finalElapsed = currentElapsed();
  app.sessionOpen = false;
  app.ready = false;
  clearTimeout(app.autoStopTimer);
  app.autoStopTimer = 0;
  app.reactor = null;
  retireVideo();
  app.endedReason = "connection lost";
  app.status = "ended";
  app.stopping = false;
  updateUI();
  showEnded("connection lost");
}

async function stopWorld(reason = "stopped") {
  if (app.stopping) return;
  if (!app.sessionOpen && !app.starting) return;
  app.stopping = true;
  app.finalElapsed = currentElapsed();
  app.sessionOpen = false;
  app.ready = false;
  clearTimeout(app.autoStopTimer);
  app.autoStopTimer = 0;
  app.poster = capturePoster();
  setStatus("ending", "Closing the Reactor session");
  if (app.recording.active) stopRecording();
  const reactor = app.reactor;
  app.reactor = null;
  if (reactor) {
    try { await reactor.disconnect(); } catch {}
  }
  retireVideo();
  app.endedReason = reason;
  app.status = "ended";
  app.message = "";
  app.starting = false;
  app.stopping = false;
  updateUI();
  showEnded(reason);
}

function startWorld() {
  if (app.starting || app.sessionOpen) return;
  if (!app.apiKey) {
    openKeyDialog(true);
    return;
  }
  beginSession();
}

function restartWorld(promptOverride = null) {
  if (!app.ready || !app.reactor) {
    showToast(app.sessionOpen ? "The world is still loading." : "Start a world first.");
    return;
  }
  const prompt = (promptOverride ?? currentPrompt()).trim().slice(0, 800) || DEFAULT_PROMPT;
  const seed = currentSeed();
  els.promptInput.value = prompt;
  els.startError.textContent = "";
  app.error = "";
  app.step = 0;
  app.frameIndex = 0;
  app.sim = {};
  setStatus("warming", "Restarting from the starting frame");
  const reactor = app.reactor;
  void (async () => {
    await reactor.sendCommand("set_seed", { seed });
    if (prompt !== app.lastPrompt) {
      await reactor.sendCommand("set_prompt", { prompt });
      app.lastPrompt = prompt;
    } else {
      await reactor.sendCommand("reset", {});
    }
    await reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
    showToast("Restarting the world.");
  })();
}

function resetWorld() {
  if (!app.ready || !app.reactor) {
    showToast("Start a world first.");
    return;
  }
  app.step = 0;
  app.frameIndex = 0;
  app.sim = {};
  setStatus("warming", "Restarting from the current pose");
  app.reactor.sendCommand("reset", {});
  app.reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
  showToast("Restarting from the current pose.");
}

function recenterArms() {
  app.controls = blankControls();
  app.hands.smooth = { left: null, right: null };
  syncArmUI("left");
  syncArmUI("right");
  if (app.ready && app.reactor) {
    app.reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
  }
  showToast("Controllers recentered to zero.");
}

function togglePause() {
  if (!app.ready || !app.reactor) return;
  const reactor = app.reactor;
  app.paused = !app.paused;
  app.lastPauseToggleAt = performance.now();
  app.status = app.paused ? "paused" : "live";
  updateUI();
  const target = app.paused;
  void reactor.sendCommand("set_paused", { paused: target }).catch((error) => {
    if (app.paused === target) {
      app.paused = !target;
      app.lastPauseToggleAt = 0;
      app.status = app.paused ? "paused" : "live";
      updateUI();
    }
    showToast(errorText(error), "error");
  });
}

async function applyImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    showToast("Choose a PNG or JPEG image.", "error");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast("Image must be smaller than 12 MB.", "error");
    return;
  }
  app.imageBusy = true;
  updateUI();
  els.imageName.textContent = "checking…";
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    if (typeof bitmap.close === "function") bitmap.close();
    if (width > 4096 || height > 4096) throw new Error("Each image side must be at most 4,096 pixels.");
    if (app.startImageUrl) URL.revokeObjectURL(app.startImageUrl);
    app.startImage = file;
    app.startImageName = file.name || "upload.png";
    app.startImageUrl = URL.createObjectURL(file);
    els.preview.src = app.startImageUrl;
    els.imageName.textContent = app.startImageName;
    if (app.ready && app.reactor) {
      setStatus("warming", "Loading the new starting frame");
      await app.reactor.sendCommand("set_seed", { seed: currentSeed() });
      const ref = await app.reactor.uploadFile(file);
      await app.reactor.sendCommand("set_image", { image: ref });
      await app.reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
      app.lastPrompt = currentPrompt();
      await app.reactor.sendCommand("set_prompt", { prompt: app.lastPrompt });
      showToast("Starting frame replaced. The world is restarting.");
    } else {
      showToast("Starting frame set for the next world.");
    }
  } catch (error) {
    els.imageName.textContent = app.startImageName;
    showToast(errorText(error), "error");
  } finally {
    app.imageBusy = false;
    els.imageInput.value = "";
    updateUI();
  }
}

function selectArm(arm) {
  if (arm !== "left" && arm !== "right") return;
  app.selected = arm;
  els.leftPanel.classList.toggle("is-selected", arm === "left");
  els.rightPanel.classList.toggle("is-selected", arm === "right");
  syncArmUI("left");
  syncArmUI("right");
}

function syncArmUI(arm) {
  const position = app.controls[arm].position;
  const grip = app.controls[`${arm}_grip`];
  const xPct = clamp(50 + (position[0] / ARM_LIMIT) * 50, 0, 100);
  const yPct = clamp(50 - (position[1] / ARM_LIMIT) * 50, 0, 100);
  const dot = arm === "left" ? els.leftDot : els.rightDot;
  dot.style.left = `${xPct}%`;
  dot.style.top = `${yPct}%`;

  els[`${arm}Z`].value = position[2];
  els[`${arm}ZOut`].textContent = `${fmt(position[2])} m`;
  els[`${arm}Grip`].value = grip;
  els[`${arm}GripOut`].textContent = grip < 0.03 ? "open" : grip > 0.97 ? "closed" : `${Math.round(grip * 100)}%`;
  els[`${arm}HudPos`].innerHTML = `${fmt(position[0])}&nbsp;&nbsp;${fmt(position[1])}&nbsp;&nbsp;${fmt(position[2])}`;
  els[`${arm}HudGrip`].style.width = `${grip * 100}%`;

  if (arm === app.selected) {
    els.padX.textContent = fmt(position[0]);
    els.padY.textContent = fmt(position[1]);
    els.padZ.textContent = fmt(position[2]);
  }
}

function setArmPosition(arm, axis, value) {
  const clamped = clamp(value, -ARM_LIMIT, ARM_LIMIT);
  if (Math.abs(app.controls[arm].position[axis] - clamped) < 0.0001) return;
  app.controls[arm].position[axis] = clamped;
  syncArmUI(arm);
  queueControl();
}

function setGrip(arm, value) {
  const clamped = clamp(value, 0, 1);
  if (Math.abs(app.controls[`${arm}_grip`] - clamped) < 0.0001) return;
  app.controls[`${arm}_grip`] = clamped;
  syncArmUI(arm);
  queueControl();
}

function toggleGrip(arm) {
  setGrip(arm, app.controls[`${arm}_grip`] > 0.5 ? 0 : 1);
}

function queueControl() {
  if (!app.ready || !app.reactor) return;
  if (app.controlTimer) return;
  app.controlTimer = window.setTimeout(sendTeleop, 45);
}

async function sendTeleop() {
  app.controlTimer = 0;
  if (!app.ready || !app.reactor) return;
  if (app.controlInFlight) {
    app.controlDirty = true;
    return;
  }
  app.controlInFlight = true;
  const reactor = app.reactor;
  try {
    await reactor.sendCommand("set_teleop", { teleop: normalizeControls(app.controls) });
    const now = performance.now();
    app.controlTimes.push(now);
    while (app.controlTimes.length && now - app.controlTimes[0] > 1000) app.controlTimes.shift();
  } finally {
    app.controlInFlight = false;
    if (app.controlDirty) {
      app.controlDirty = false;
      queueControl();
    }
  }
}

function buildPresets() {
  els.presets.innerHTML = "";
  PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-btn";
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      $$(".preset-btn", els.presets).forEach((node) => node.classList.remove("is-active"));
      button.classList.add("is-active");
      els.promptInput.value = preset.prompt;
      if (app.ready) {
        restartWorld(preset.prompt);
      } else {
        showToast("Prompt set for the next world.");
      }
    });
    els.presets.appendChild(button);
  });
}

function bindPad(pad, arm) {
  const update = (event) => {
    const rect = pad.getBoundingClientRect();
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    setArmPosition(arm, 0, (nx - 0.5) * ARM_LIMIT * 2);
    setArmPosition(arm, 1, (0.5 - ny) * ARM_LIMIT * 2);
  };
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    selectArm(arm);
    pad.setPointerCapture(event.pointerId);
    pad.classList.add("is-active");
    update(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (pad.hasPointerCapture(event.pointerId)) update(event);
  });
  const finish = (event) => {
    if (pad.hasPointerCapture(event.pointerId)) pad.releasePointerCapture(event.pointerId);
    pad.classList.remove("is-active");
  };
  pad.addEventListener("pointerup", finish);
  pad.addEventListener("pointercancel", finish);
}

function bindScene() {
  els.stage.addEventListener("pointerdown", (event) => {
    if (app.mode !== "pointer" || event.button !== 0) return;
    if (!app.frames.hasFrame) return;
    if (event.target.closest(".overlay, .dialog, button, input, textarea")) return;
    event.preventDefault();
    els.stage.setPointerCapture(event.pointerId);
    app.pointerDrag = {
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      arm: app.selected,
    };
  });
  els.stage.addEventListener("pointermove", (event) => {
    const drag = app.pointerDrag;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (event.shiftKey) {
      setArmPosition(drag.arm, 2, app.controls[drag.arm].position[2] - dy * 0.001);
    } else {
      setArmPosition(drag.arm, 0, app.controls[drag.arm].position[0] + dx * 0.0006);
      setArmPosition(drag.arm, 1, app.controls[drag.arm].position[1] - dy * 0.0006);
    }
  });
  const finish = (event) => {
    const drag = app.pointerDrag;
    if (!drag) return;
    app.pointerDrag = null;
    if (els.stage.hasPointerCapture(event.pointerId)) els.stage.releasePointerCapture(event.pointerId);
    if (drag.moved < 5) toggleGrip(drag.arm);
  };
  els.stage.addEventListener("pointerup", finish);
  els.stage.addEventListener("pointercancel", () => {
    app.pointerDrag = null;
  });
  els.stage.addEventListener("wheel", (event) => {
    if (app.mode !== "pointer" || !app.frames.hasFrame) return;
    event.preventDefault();
    setArmPosition(app.selected, 2, app.controls[app.selected].position[2] - event.deltaY * 0.00045);
  }, { passive: false });
}

function setMode(mode) {
  app.mode = mode;
  $$(".mode-btn").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  els.pointerHelp.hidden = mode !== "pointer";
  els.handsHelp.hidden = mode !== "hands";
  els.gamepadHelp.hidden = mode !== "gamepad";
  els.stage.classList.toggle("is-pointer", mode === "pointer");
  if (mode !== "hands" && app.hands.stream) stopCamera();
  updateUI();
}

function bindControls() {
  for (const arm of ["left", "right"]) {
    bindPad(arm === "left" ? els.leftPad : els.rightPad, arm);
    els[`${arm}Z`].addEventListener("input", (event) => {
      setArmPosition(arm, 2, Number(event.target.value));
    });
    els[`${arm}Grip`].addEventListener("input", (event) => {
      setGrip(arm, Number(event.target.value));
    });
    $$(`.grip-toggle[data-arm="${arm}"]`).forEach((button) => {
      button.addEventListener("click", () => toggleGrip(arm));
    });
  }
  els.applyBtn.addEventListener("click", () => {
    if (!app.ready) {
      showToast("Start a world first.");
      return;
    }
    const prompt = currentPrompt();
    const seed = currentSeed();
    if (prompt !== app.lastPrompt) {
      restartWorld(prompt);
    } else {
      app.reactor.sendCommand("set_seed", { seed });
      resetWorld();
    }
  });
  els.imageBtn.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", () => {
    const file = els.imageInput.files?.[0];
    if (file) applyImage(file);
  });
  els.startBtn.addEventListener("click", startWorld);
  els.restartBtn.addEventListener("click", startWorld);
  els.stopBtn.addEventListener("click", () => stopWorld("stopped"));
  els.pauseBtn.addEventListener("click", togglePause);
  els.resetBtn.addEventListener("click", resetWorld);
  els.recenterBtn.addEventListener("click", recenterArms);
  els.snapBtn.addEventListener("click", saveFrame);
  els.recordBtn.addEventListener("click", toggleRecording);
}

function handleKeydown(event) {
  if (isTyping(event.target)) return;
  if (els.aboutDialog.open || els.keyDialog.open) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "1") {
    selectArm("left");
  } else if (event.key === "2") {
    selectArm("right");
  } else if (event.key.toLowerCase() === "g") {
    toggleGrip(app.selected);
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePause();
  } else if (event.key.toLowerCase() === "r") {
    resetWorld();
  } else if (event.key.toLowerCase() === "c") {
    recenterArms();
  } else if (event.key.toLowerCase() === "p") {
    saveFrame();
  }
}

function renderClock() {
  const elapsed = currentElapsed();
  els.elapsed.textContent = fmtClock(elapsed);
  els.spend.textContent = `$${(elapsed / 60 * PRICE_PER_MIN).toFixed(3)}`;
  els.sessionReadout.textContent = `${fmtClock(elapsed)} · $${(elapsed / 60 * PRICE_PER_MIN).toFixed(3)}`;
  const percent = clamp(elapsed / SESSION_LIMIT * 100, 0, 100);
  els.sessionProgress.style.width = `${percent}%`;
  els.sessionProgress.classList.toggle("is-hot", percent > 82);
  if (app.ready) {
    const now = performance.now();
    while (app.controlTimes.length && now - app.controlTimes[0] > 1000) app.controlTimes.shift();
    els.latencyReadout.textContent = `ctrl ${app.controlTimes.length}/s`;
  } else if (app.sessionOpen) {
    els.latencyReadout.textContent = "connecting";
  } else {
    els.latencyReadout.textContent = "browser link";
  }
}

function startVideoMetrics() {
  if (app.frames.looping) return;
  app.frames.looping = true;
  const video = els.video;

  const tick = (now) => {
    if (!app.frames.looping) return;
    app.frames.count += 1;
    app.frames.width = video.videoWidth || app.frames.width;
    app.frames.height = video.videoHeight || app.frames.height;
    app.frames.times.push(now);
    while (app.frames.times.length && now - app.frames.times[0] > 1000) app.frames.times.shift();
    if (!app.lastStatsAt || now - app.lastStatsAt > 2500) {
      els.clientFps.textContent = `${app.frames.times.length.toFixed(1)} fps`;
    }
    if (!app.frames.hasFrame && frameHasContent(video)) {
      app.frames.hasFrame = true;
      els.stage.classList.add("has-frame");
      flashBoot();
    }
    if (app.frames.hasFrame) {
      els.resolutionReadout.textContent = `${app.frames.width}×${app.frames.height}`;
      els.snapBtn.disabled = false;
      els.recordBtn.disabled = !app.sessionOpen;
    }
    if (app.ready && app.frames.hasFrame && !app.stopping) {
      const next = app.paused ? "paused" : "live";
      if (app.status !== next) {
        app.status = next;
        updateUI();
      }
    }
    if ("requestVideoFrameCallback" in video) {
      app.frames.callbackId = video.requestVideoFrameCallback(tick);
    }
  };

  if ("requestVideoFrameCallback" in video) {
    app.frames.callbackId = video.requestVideoFrameCallback(tick);
  } else {
    const interval = window.setInterval(() => {
      if (!app.frames.looping || !app.sessionOpen) {
        window.clearInterval(interval);
        return;
      }
      tick(performance.now());
    }, 33);
  }
}

function frameHasContent(video) {
  if (!video.videoWidth || !video.videoHeight) return false;
  const canvas = app.frames.sampleCanvas || (app.frames.sampleCanvas = document.createElement("canvas"));
  canvas.width = 32;
  canvas.height = 18;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  try {
    ctx.drawImage(video, 0, 0, 32, 18);
    const pixels = ctx.getImageData(0, 0, 32, 18).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722 > 20) bright += 1;
    }
    return bright > 16;
  } catch {
    return true;
  }
}

function capturePoster() {
  if (!app.frames.hasFrame) return "";
  const video = els.video;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return "";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch (error) {
    console.warn("Last-frame capture failed", error);
    return "";
  }
}

function retireVideo() {
  app.frames.hasFrame = false;
  app.frames.looping = false;
  if (app.frames.callbackId && els.video.cancelVideoFrameCallback) {
    try { els.video.cancelVideoFrameCallback(app.frames.callbackId); } catch {}
  }
  app.frames.callbackId = 0;
  if (app.poster) els.preview.src = app.poster;
  els.stage.classList.remove("has-frame");
  try {
    els.video.pause();
    els.video.srcObject = null;
  } catch {}
  els.clientFps.textContent = "0.0 fps";
  els.snapBtn.disabled = true;
  els.recordBtn.disabled = true;
}

function saveFrame() {
  if (!app.frames.hasFrame) {
    showToast("No generated frame yet.");
    return;
  }
  const video = els.video;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (!width || !height) {
    showToast("No generated frame yet.");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(video, 0, 0, width, height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `cosmos-bimanual-${stamp()}.png`);
    showToast("Frame saved.");
  }, "image/png");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function toggleRecording() {
  if (app.recording.active) {
    stopRecording();
    return;
  }
  if (!app.frames.hasFrame) {
    showToast("Wait for a generated frame first.");
    return;
  }
  if (!window.MediaRecorder) {
    showToast("This browser cannot record the stream.", "error");
    return;
  }
  const source = els.video.srcObject;
  let stream;
  if (source instanceof MediaStream) {
    stream = new MediaStream(source.getVideoTracks());
  } else if (typeof els.video.captureStream === "function") {
    stream = els.video.captureStream(30);
  }
  if (!stream || !stream.getVideoTracks().length) {
    showToast("The stream is not ready to record.", "error");
    return;
  }
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  app.recording = { active: true, recorder, chunks: [], mime };
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) app.recording.chunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    const blob = new Blob(app.recording.chunks, { type: app.recording.mime || "video/webm" });
    if (blob.size) downloadBlob(blob, `cosmos-bimanual-${stamp()}.webm`);
    app.recording.active = false;
    els.recordBtn.classList.remove("is-recording");
    els.recordBtn.querySelector(".label").textContent = "Record";
    showToast("Take saved.");
  });
  recorder.start(500);
  els.recordBtn.classList.add("is-recording");
  els.recordBtn.querySelector(".label").textContent = "Stop";
  showToast("Recording the generated stream.");
}

function stopRecording() {
  if (!app.recording.active) return;
  try {
    app.recording.recorder.stop();
  } catch {
    app.recording.active = false;
    els.recordBtn.classList.remove("is-recording");
    els.recordBtn.querySelector(".label").textContent = "Record";
  }
}

function setHandStatus(text) {
  els.handStatus.textContent = text;
}

async function loadHandLandmarker() {
  if (app.hands.landmarker) return app.hands.landmarker;
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm",
  );
  app.hands.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  return app.hands.landmarker;
}

async function startCamera() {
  if (app.hands.loading) return;
  if (app.hands.stream) {
    stopCamera();
    return;
  }
  app.hands.loading = true;
  els.cameraBtn.disabled = true;
  setHandStatus("Requesting camera access…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    app.hands.stream = stream;
    els.cameraVideo.srcObject = stream;
    await els.cameraVideo.play();
    els.cameraIdle.hidden = true;
    setHandStatus("Loading hand tracking…");
    await loadHandLandmarker();
    app.hands.enabled = true;
    app.hands.lastVideoTime = -1;
    app.hands.neutral = null;
    app.hands.neutralTimer = 0;
    app.hands.smooth = { left: null, right: null };
    els.neutralBtn.disabled = false;
    els.swapHandsBtn.disabled = false;
    els.cameraBtn.textContent = "Turn camera off";
    setHandStatus("Show both hands. Neutral pose is captured automatically.");
    requestAnimationFrame(handLoop);
  } catch (error) {
    stopCamera();
    setHandStatus("Camera or hand tracking failed. Pointer and gamepad still work.");
    showToast(errorText(error), "error");
  } finally {
    app.hands.loading = false;
    els.cameraBtn.disabled = false;
  }
}

function stopCamera() {
  app.hands.enabled = false;
  app.hands.lastVideoTime = -1;
  app.hands.neutralTimer = 0;
  if (app.hands.stream) {
    app.hands.stream.getTracks().forEach((track) => track.stop());
    app.hands.stream = null;
  }
  els.cameraVideo.srcObject = null;
  els.cameraIdle.hidden = false;
  els.cameraBtn.textContent = "Enable camera";
  els.neutralBtn.disabled = true;
  els.swapHandsBtn.disabled = true;
  setHandStatus("Hand tracking loads in this browser, not on the GPU.");
  const ctx = els.handCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.handCanvas.width, els.handCanvas.height);
}

function handLoop(timestamp) {
  if (!app.hands.enabled) return;
  const video = els.cameraVideo;
  if (video.readyState >= 2 && video.currentTime !== app.hands.lastVideoTime && app.hands.landmarker) {
    app.hands.lastVideoTime = video.currentTime;
    try {
      const result = app.hands.landmarker.detectForVideo(video, timestamp);
      processHands(result, timestamp);
    } catch {
      setHandStatus("Hand tracking hit an error. Try turning the camera off and on.");
    }
  }
  requestAnimationFrame(handLoop);
}

function processHands(result, timestamp) {
  const landmarks = result.landmarks || [];
  const ctx = els.handCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.handCanvas.width, els.handCanvas.height);

  const detected = landmarks.map((points) => {
    const wrist = points[0];
    const middle = points[9];
    const x = 1 - wrist.x;
    const y = wrist.y;
    const size = Math.max(0.01, Math.hypot(middle.x - wrist.x, middle.y - wrist.y));
    const pinch = Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) / size;
    return { points, x, y, size, pinch };
  });

  detected.sort((a, b) => a.x - b.x);
  detected.forEach((hand, index) => {
    let side = detected.length >= 2 ? (index === 0 ? "left" : "right") : (hand.x < 0.5 ? "left" : "right");
    if (app.hands.swap) side = side === "left" ? "right" : "left";
    hand.side = side;
  });
  app.hands.current = detected;

  if (!app.hands.neutral) {
    if (detected.length >= 2) {
      if (!app.hands.neutralTimer) app.hands.neutralTimer = timestamp;
      else if (timestamp - app.hands.neutralTimer > 1100) captureNeutral(detected);
    } else {
      app.hands.neutralTimer = 0;
    }
  }

  if (detected.length === 0) {
    setHandStatus("Show both hands to the camera.");
  } else if (detected.length === 1) {
    setHandStatus("Tracking one hand. Show the other to control both arms.");
  } else {
    setHandStatus(app.hands.neutral ? "Both hands tracked. Pinch to close a gripper." : "Hold both hands up to set neutral.");
  }

  for (const hand of detected) {
    const color = hand.side === "left" ? "#88f4c3" : "#f0a276";
    drawHand(ctx, hand.points, color, hand.side);
    if (!app.hands.neutral) continue;

    const neutral = app.hands.neutral[hand.side];
    if (!neutral) continue;
    const px = clamp((hand.x - neutral.x) * 0.55, -ARM_LIMIT, ARM_LIMIT);
    const py = clamp(-(hand.y - neutral.y) * 0.55, -ARM_LIMIT, ARM_LIMIT);
    const pz = clamp((hand.size / neutral.size - 1) * 0.55, -ARM_LIMIT, ARM_LIMIT);
    const previous = app.hands.smooth[hand.side];
    const smooth = previous
      ? [
          previous[0] + (px - previous[0]) * 0.38,
          previous[1] + (py - previous[1]) * 0.38,
          previous[2] + (pz - previous[2]) * 0.38,
        ]
      : [px, py, pz];
    app.hands.smooth[hand.side] = smooth;

    const pinch = clamp((1.15 - hand.pinch) / 0.85, 0, 1);
    const grip = app.hands.grip[hand.side] + (pinch - app.hands.grip[hand.side]) * 0.3;
    app.hands.grip[hand.side] = grip;

    setArmPosition(hand.side, 0, smooth[0]);
    setArmPosition(hand.side, 1, smooth[1]);
    setArmPosition(hand.side, 2, smooth[2]);
    setGrip(hand.side, grip);
  }
}

function drawHand(ctx, points, color, label) {
  const width = els.handCanvas.width;
  const height = els.handCanvas.height;
  const toPoint = (point) => ({ x: (1 - point.x) * width, y: point.y * height });
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.86;
  for (const [start, end] of HAND_CONNECTIONS) {
    const a = toPoint(points[start]);
    const b = toPoint(points[end]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let index = 0; index < points.length; index += 1) {
    const point = toPoint(points[index]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, index === 0 ? 3.2 : 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  const wrist = toPoint(points[0]);
  ctx.fillStyle = "rgba(7,16,12,.75)";
  ctx.fillRect(wrist.x + 6, wrist.y - 12, 18, 14);
  ctx.fillStyle = color;
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillText(label === "left" ? "L" : "R", wrist.x + 10, wrist.y - 2);
}

function captureNeutral(hands = app.hands.current) {
  if (!hands || !hands.length) {
    showToast("Show at least one hand first.", "error");
    return;
  }
  const neutral = {
    left: { x: 0.32, y: 0.6, size: 0.12 },
    right: { x: 0.68, y: 0.6, size: 0.12 },
  };
  for (const hand of hands) {
    neutral[hand.side] = { x: hand.x, y: hand.y, size: hand.size };
  }
  app.hands.neutral = neutral;
  app.hands.neutralTimer = 0;
  app.hands.smooth = { left: null, right: null };
  app.hands.grip = { left: 0, right: 0 };
  showToast("Neutral captured. Move your hands to steer the arms.");
}

function swapHands() {
  app.hands.swap = !app.hands.swap;
  app.hands.neutral = null;
  app.hands.neutralTimer = 0;
  app.hands.smooth = { left: null, right: null };
  showToast("Hand mapping swapped. Show both hands to set neutral again.");
}

function bindHands() {
  els.cameraBtn.addEventListener("click", startCamera);
  els.neutralBtn.addEventListener("click", () => captureNeutral());
  els.swapHandsBtn.addEventListener("click", swapHands);
}

function gamepadLoop(timestamp) {
  const dt = clamp((timestamp - (app.gamepad.lastTime || timestamp)) / 1000, 0, 0.05);
  app.gamepad.lastTime = timestamp;
  if (app.mode === "gamepad") {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const pad = pads.find((candidate) => candidate.connected);
    if (pad) {
      app.gamepad.connected = true;
      app.gamepad.name = pad.id;
      const axes = pad.axes;
      const dead = (value) => (Math.abs(value) < 0.12 ? 0 : value);
      const leftX = dead(axes[0] || 0);
      const leftY = dead(axes[1] || 0);
      const rightX = dead(axes[2] || 0);
      const rightY = dead(axes[3] || 0);
      const leftGrip = pad.buttons[6]?.value || 0;
      const rightGrip = pad.buttons[7]?.value || 0;
      setArmPosition("left", 0, leftX * ARM_LIMIT);
      setArmPosition("left", 1, -leftY * ARM_LIMIT);
      setArmPosition("right", 0, rightX * ARM_LIMIT);
      setArmPosition("right", 1, -rightY * ARM_LIMIT);
      setGrip("left", leftGrip);
      setGrip("right", rightGrip);

      const dpadUp = pad.buttons[12]?.pressed ? 1 : 0;
      const dpadDown = pad.buttons[13]?.pressed ? 1 : 0;
      if (dpadUp || dpadDown) {
        const delta = (dpadDown - dpadUp) * 0.32 * dt;
        setArmPosition("left", 2, app.controls.left.position[2] + delta);
        setArmPosition("right", 2, app.controls.right.position[2] + delta);
      }
      if (pad.buttons[4]?.pressed && !app.gamepad.prevButtons[4]) selectArm("left");
      if (pad.buttons[5]?.pressed && !app.gamepad.prevButtons[5]) selectArm("right");
      app.gamepad.prevButtons = pad.buttons.map((button) => button.pressed);
      els.gamepadStatus.textContent = `${pad.id.slice(0, 54)} connected. LT/RT close the grippers.`;
      els.lx.textContent = fmt(leftX);
      els.ly.textContent = fmt(leftY);
      els.rx.textContent = fmt(rightX);
      els.ry.textContent = fmt(rightY);
    } else {
      app.gamepad.connected = false;
      els.gamepadStatus.textContent = "No gamepad detected. Press a button on the controller to wake it.";
    }
  }
  requestAnimationFrame(gamepadLoop);
}

function bindAbout() {
  const open = () => els.aboutDialog.showModal();
  const close = () => els.aboutDialog.close();
  els.aboutBtn.addEventListener("click", open);
  els.startAboutBtn.addEventListener("click", open);
  els.closeAbout.addEventListener("click", close);
  els.dialogDone.addEventListener("click", close);
  els.aboutDialog.addEventListener("click", (event) => {
    if (event.target === els.aboutDialog) close();
  });
}

function bindKeyDialog() {
  els.keyBtn.addEventListener("click", () => openKeyDialog(false));
  els.closeKey.addEventListener("click", closeKeyDialog);
  els.keyDialog.addEventListener("cancel", () => {
    els.apiKeyInput.value = "";
    app.startAfterKey = false;
  });
  els.keyDialog.addEventListener("click", (event) => {
    if (event.target === els.keyDialog) closeKeyDialog();
  });
  els.toggleKey.addEventListener("click", () => {
    const showing = els.apiKeyInput.type === "text";
    els.apiKeyInput.type = showing ? "password" : "text";
    els.toggleKey.textContent = showing ? "Show" : "Hide";
    els.apiKeyInput.focus();
  });
  els.forgetKey.addEventListener("click", () => {
    app.apiKey = "";
    els.apiKeyInput.value = "";
    els.keyError.textContent = "";
    els.apiKeyInput.placeholder = "rk_...";
    updateKeyUI();
    els.apiKeyInput.focus();
  });
  els.keyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const entered = els.apiKeyInput.value.trim();
    if (!entered) {
      if (!app.apiKey) {
        els.keyError.textContent = "Paste a Reactor API key first.";
        return;
      }
      const start = app.startAfterKey;
      closeKeyDialog();
      if (start) startWorld();
      return;
    }
    if (!entered.startsWith("rk_")) {
      els.keyError.textContent = "Reactor keys start with rk_.";
      return;
    }
    app.apiKey = entered;
    els.apiKeyInput.value = "";
    updateKeyUI();
    const start = app.startAfterKey;
    closeKeyDialog();
    showToast("Key loaded in this tab only.");
    if (start) startWorld();
  });
}

function init() {
  buildPresets();
  bindControls();
  bindScene();
  bindHands();
  bindAbout();
  bindKeyDialog();
  $$(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("gamepadconnected", (event) => {
    app.gamepad.connected = true;
    showToast(`${event.gamepad.id.slice(0, 42)} connected.`);
  });
  window.addEventListener("pagehide", () => {
    if (app.hands.stream) stopCamera();
    if (app.recording.active) {
      try { stopRecording(); } catch {}
    }
    if (app.sessionOpen && app.reactor) {
      app.reactor.disconnect().catch(() => {});
    }
  });
  setMode("pointer");
  syncArmUI("left");
  syncArmUI("right");
  updateKeyUI();
  updateUI();
  renderClock();
  fetchDefaultImage().catch(() => {});
  window.setInterval(renderClock, 200);
  requestAnimationFrame(gamepadLoop);
}

init();
