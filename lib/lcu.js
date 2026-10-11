"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

const agent = new https.Agent({ rejectUnauthorized: false });
const PRODUCT_SETTINGS =
  process.env.PROGRAMDATA
    ? path.join(
        process.env.PROGRAMDATA,
        "Riot Games",
        "Metadata",
        "league_of_legends.live",
        "league_of_legends.live.product_settings.yaml"
      )
    : null;

function leagueInstallDir() {
  if (!PRODUCT_SETTINGS) return null;
  try {
    const text = fs.readFileSync(PRODUCT_SETTINGS, "utf8");
    const match = text.match(/product_install_full_path:\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function lockfileCandidates() {
  const install = leagueInstallDir();
  const local = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Riot Games", "League of Legends", "lockfile")
    : null;
  return [install ? path.join(install, "lockfile") : null, local, "C:\\Riot Games\\League of Legends\\lockfile"].filter(Boolean);
}

function readLockfile() {
  for (const file of lockfileCandidates()) {
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf8").trim();
    } catch {
      continue;
    }
    if (!raw) continue;
    const parts = raw.split(":");
    if (parts.length < 5) continue;
    const port = Number(parts[2]);
    const protocol = parts[parts.length - 1];
    const password = parts.slice(3, -1).join(":");
    if (!port || !password) continue;
    return { port, protocol, password };
  }
  return null;
}

function lcuGet(pathname) {
  const lock = readLockfile();
  if (!lock) return Promise.resolve(null);
  const auth = Buffer.from(`riot:${lock.password}`).toString("base64");
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "127.0.0.1",
        port: lock.port,
        path: pathname,
        agent,
        timeout: 1500,
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200 || !body) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function readChampSelect() {
  const phase = await lcuGet("/lol-gameflow/v1/gameflow-phase");
  if (typeof phase !== "string") return { online: false, phase: null, classic: false };
  if (phase !== "ChampSelect") return { online: true, phase, classic: false };
  const session = await lcuGet("/lol-gameflow/v1/session");
  const gameMode = session?.gameData?.queue?.gameMode || "";
  const mode = String(gameMode || "CLASSIC").toUpperCase();
  const enabled = mode === "CLASSIC" || mode === "PRACTICETOOL";
  return { online: true, phase, enabled, gameMode: gameMode || "CLASSIC" };
}

module.exports = { readLockfile, lcuGet, readChampSelect, leagueInstallDir };
