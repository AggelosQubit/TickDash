"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getLiveSnapshot } = require("./live-dmg");
const { teamPowerSample } = require("./team-power");
const { typeIntoLeague } = require("./type-into-league");

let lastCopied = null;
let readyText = null;
let sentText = null;
let typing = false;
let phase = null;
let scalarLog = { sessionId: null, samples: [] };
let scalarDir = null;

function clipboardEnabled(gameMode) {
  const mode = String(gameMode || "").toUpperCase();
  return mode === "CLASSIC" || mode === "PRACTICETOOL";
}

function getLastClipboard() {
  return lastCopied ? { text: lastCopied.text, at: lastCopied.at } : { text: null, at: null };
}

function rememberClipboard(text) {
  lastCopied = { text, at: new Date().toISOString() };
}

function setReady(text) {
  readyText = text || null;
}

function getChatState() {
  return { ready: readyText, sent: sentText, typing, phase };
}

function getPowerScalars() {
  return scalarLog;
}

function beginScalars(sessionId, dir) {
  scalarLog = { sessionId: sessionId || null, samples: [] };
  scalarDir = dir || null;
  writeScalars();
}

function writeScalars() {
  if (!scalarDir) return;
  fs.mkdirSync(scalarDir, { recursive: true });
  fs.writeFileSync(path.join(scalarDir, "power-scalars.json"), JSON.stringify(scalarLog, null, 2), "utf8");
}

function pushScalar(sample) {
  if (!sample?.line) return;
  scalarLog.samples.push(sample);
  setReady(sample.line);
  writeScalars();
}

async function sendReady() {
  if (typing) throw new Error("frappe en cours");
  if (!readyText) throw new Error("aucun message prêt");
  const text = readyText;
  typing = true;
  phase = "wait-focus";
  console.log(`[TickDash] ${new Date().toISOString()} Frappe start`);
  try {
    await typeIntoLeague(text, (name) => {
      if (name === "wait-focus" || name === "typing") phase = name;
    });
    sentText = text;
    rememberClipboard(text);
    phase = "validate";
    setTimeout(() => {
      if (phase === "validate") phase = null;
    }, 1800);
    console.log(`[TickDash] ${new Date().toISOString()} Frappe ok → ${text}`);
    return text;
  } catch (err) {
    phase = null;
    console.log(`[TickDash] ${new Date().toISOString()} Frappe FAIL: ${err.message}`);
    throw err;
  } finally {
    typing = false;
  }
}

function setClipboard(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", "[Console]::In.ReadToEnd() | Set-Clipboard"],
      { windowsHide: true }
    );
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `clipboard exit ${code}`));
    });
    child.stdin.end(String(text), "utf8");
  });
}

class ChatClipboard {
  constructor(gameMode, log, sessionDir, sessionId) {
    this.enabled = clipboardEnabled(gameMode);
    this.gameMode = gameMode;
    this.log = log || (() => {});
    this.sessionDir = sessionDir || null;
    this.sessionId = sessionId || null;
    this.timer = null;
    this.aligned = false;
    this.lastMinute = -1;
    this.pending = Promise.resolve();
  }

  start() {
    if (!this.enabled) {
      this.log(`Clipboard off (${this.gameMode || "?"}) — ranked, normal et practice tool uniquement`);
      return;
    }
    beginScalars(this.sessionId, this.sessionDir);
    this.log("Clipboard on — ranked, normal et practice tool, chaque minute de jeu");
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (!this.enabled) return;
    const snap = getLiveSnapshot();
    if (!snap?.players?.length) return;
    const gameTime = Number(snap.gameTime);
    if (!Number.isFinite(gameTime) || gameTime < 0) return;
    const sample = teamPowerSample(snap.players, gameTime);
    if (!sample) return;

    const minute = sample.min;
    if (!this.aligned) {
      this.aligned = true;
      this.lastMinute = minute;
      pushScalar(sample);
      this.log(`Scalar min ${minute} → ${sample.line}`);
      return;
    }
    if (minute > this.lastMinute) {
      this.lastMinute = minute;
      pushScalar(sample);
      this.log(`Scalar min ${minute} → ${sample.line}`);
    }
  }
}

module.exports = {
  ChatClipboard,
  clipboardEnabled,
  setClipboard,
  rememberClipboard,
  getLastClipboard,
  setReady,
  getChatState,
  getPowerScalars,
  sendReady,
};
