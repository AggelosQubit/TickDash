"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { ROOT } = require("./paths");

const SCRIPT = path.join(ROOT, "scripts", "type-into-league.ps1");
const CHAR_MS = 30;

function typeDurationMs(text) {
  const chars = String(text || "").length;
  return 150 + 180 + chars * CHAR_MS + 80 + 40;
}

function typeIntoLeague(text, onPhase) {
  const message = String(text || "");
  if (!message.trim()) return Promise.reject(new Error("aucun message"));
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
      { windowsHide: true }
    );
    let err = "";
    let out = "";
    const take = (chunk) => {
      out += chunk;
      let nl;
      while ((nl = out.indexOf("\n")) >= 0) {
        const line = out.slice(0, nl).replace(/\r$/, "").trim();
        out = out.slice(nl + 1);
        if (line.startsWith("phase ") && onPhase) onPhase(line.slice(6).trim());
      }
    };
    child.stdout.on("data", take);
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ ms: typeDurationMs(message) });
      else reject(new Error(err.trim() || `frappe exit ${code}`));
    });
    child.stdin.end(message, "utf8");
  });
}

module.exports = { typeIntoLeague, typeDurationMs, CHAR_MS };
