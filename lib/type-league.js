"use strict";

const path = require("path");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "type-league.ps1");
const CHAR_MS = 15;

function typeDurationMs(text) {
  const chars = String(text || "").length;
  return 220 + 180 + chars * CHAR_MS + 40;
}

function runTyper(text, checkOnly) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
      {
        windowsHide: true,
        env: { ...process.env, TICKDASH_TYPE_MODE: checkOnly ? "check" : "" },
      }
    );
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else if (code === 2) reject(new Error("League n'est pas ouvert"));
      else reject(new Error(err.trim() || `frappe exit ${code}`));
    });
    child.stdin.end(String(text || " "), "utf8");
  });
}

function typeIntoLeague(text) {
  return runTyper(text, false);
}

module.exports = { typeIntoLeague, typeDurationMs, CHAR_MS };
