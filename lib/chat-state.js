"use strict";

const fs = require("fs");
const path = require("path");

let readyText = null;
let sent = null;
let typing = false;
let powerLog = { sessionId: null, dir: null, samples: [] };

function setReady(text) {
  readyText = text || null;
}

function getReady() {
  return readyText;
}

function beginTyping() {
  if (typing) return false;
  typing = true;
  return true;
}

function endTyping() {
  typing = false;
}

function markSent(text) {
  sent = { text, at: new Date().toISOString() };
}

function getChatState() {
  return {
    ready: readyText,
    sent: sent ? sent.text : null,
    sentAt: sent ? sent.at : null,
    typing,
  };
}

function writePowerLog() {
  if (!powerLog.dir) return;
  const file = path.join(powerLog.dir, "power-scalars.json");
  const body = { sessionId: powerLog.sessionId, samples: powerLog.samples };
  fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf8");
}

function bindPowerLog(sessionId, dir) {
  powerLog = { sessionId, dir, samples: [] };
  writePowerLog();
}

function recordSample(sample) {
  if (!sample || !Number.isFinite(sample.min)) return;
  if (powerLog.samples.some((row) => row.min === sample.min)) return;
  powerLog.samples.push({
    min: sample.min,
    us: sample.us,
    them: sample.them,
    line: sample.line,
    at: new Date().toISOString(),
  });
  if (sample.line) setReady(sample.line);
  writePowerLog();
}

function getPowerLog() {
  return { sessionId: powerLog.sessionId, samples: powerLog.samples.slice() };
}

module.exports = {
  setReady,
  getReady,
  beginTyping,
  endTyping,
  markSent,
  getChatState,
  bindPowerLog,
  recordSample,
  getPowerLog,
};
