"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./paths");
const { getLiveSnapshot, getLiveSnapshotError } = require("./live-dmg");
const { getLastClipboard, getChatState, getPowerScalars, sendReady } = require("./chat-clipboard");
const { getLobbyRanks, reloadRanks } = require("./lobby-ranks");
const { getChampionBuild } = require("./champion-build");
const { getEnemyBuys } = require("./item-prices");

const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** HTTP server persistant — reste ouvert entre les games */
function createDaemonServer(port) {
  let server = null;
  let sessionMeta = null;
  let tail = null;

  function attachSession(meta, tailInstance) {
    sessionMeta = meta;
    tail = tailInstance;
  }

  function detachSession() {
    sessionMeta = null;
    tail = null;
  }

  function getSession() {
    return sessionMeta;
  }

  function readJsonSafe(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  function readRecentEvents(limit) {
    if (!sessionMeta?.dir) return [];
    const jsonl = path.join(sessionMeta.dir, "gep.jsonl");
    if (!fs.existsSync(jsonl)) return [];
    const lines = fs.readFileSync(jsonl, "utf8").trim().split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  }

  function json(res, status, payload) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(payload, null, 2));
  }

  function html(res, filePath) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(filePath, "utf8"));
  }

  function attachLivePlayers(state) {
    const snap = getLiveSnapshot();
    if (snap) state.livePlayers = snap;
    else if (getLiveSnapshotError()) state.livePlayers = { ok: false, error: getLiveSnapshotError() };
    return state;
  }

  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer(async (req, res) => {
        const url = req.url.split("?")[0];
        const qs = new URL(req.url, "http://127.0.0.1").searchParams;

        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        if (url === "/ranks/reload" && req.method === "POST") {
          try {
            const ranks = await reloadRanks();
            json(res, 200, { ok: true, ranks });
          } catch (err) {
            json(res, 500, { ok: false, error: err.message });
          }
          return;
        }

        if (url === "/chat/send" && req.method === "POST") {
          try {
            const text = await sendReady();
            json(res, 200, { ok: true, text });
          } catch (err) {
            json(res, 409, { ok: false, error: err.message });
          }
          return;
        }

        if (url === "/gep/push" && req.method === "POST") {
          try {
            const payload = await readJsonBody(req);
            if (!tail) {
              json(res, 503, { ok: false, error: "no active session" });
              return;
            }
            tail.push(payload);
            json(res, 200, { ok: true });
          } catch (err) {
            json(res, 400, { ok: false, error: err.message });
          }
          return;
        }

        if (url === "/" || url === "/ui") {
          html(res, path.join(PUBLIC_DIR, "index.html"));
          return;
        }

        if (url === "/postmortem") {
          html(res, path.join(PUBLIC_DIR, "postmortem.html"));
          return;
        }

        if (url === "/postmortem.js") {
          res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
          res.end(fs.readFileSync(path.join(PUBLIC_DIR, "postmortem.js"), "utf8"));
          return;
        }

        if (url === "/items-completed.json") {
          const filePath = path.join(DATA_DIR, "items-completed.json");
          if (!fs.existsSync(filePath)) {
            json(res, 404, { error: "items-completed.json missing — run scripts/fetch-items-completed.js" });
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(fs.readFileSync(filePath, "utf8"));
          return;
        }

        if (url === "/status") {
          json(res, 200, {
            daemon: "tickdash",
            version: 3,
            session: sessionMeta,
            waiting: !sessionMeta,
            clipboard: getLastClipboard(),
            chat: getChatState(),
            powerScalars: getPowerScalars(),
            ranks: getLobbyRanks(),
            build: getChampionBuild(),
            enemyBuys: getEnemyBuys(),
            endpoints: { gep: "/gep", events: "/gep/events", stream: "/gep/stream", push: "/gep/push", live: "/live/players" },
          });
          return;
        }

        if (url === "/gep") {
          if (!sessionMeta?.dir) {
            json(res, 200, attachLivePlayers({ info: {}, eventCount: 0, waiting: true }));
            return;
          }
          const state = readJsonSafe(path.join(sessionMeta.dir, "gep-state.json")) || { info: {}, eventCount: 0 };
          json(res, 200, attachLivePlayers(state));
          return;
        }

        if (url === "/gep/events") {
          const limit = Math.min(Number(qs.get("limit")) || 80, 500);
          json(res, 200, { events: readRecentEvents(limit) });
          return;
        }

        if (url === "/live/players") {
          const snap = getLiveSnapshot();
          if (snap) {
            json(res, 200, snap);
            return;
          }
          const err = getLiveSnapshotError();
          json(res, 503, { ok: false, error: err || "no live data yet" });
          return;
        }

        if (url === "/gep/stream") {
          if (!sessionMeta?.dir) {
            res.writeHead(200, {
              "Content-Type": "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            });
            res.end("");
            return;
          }
          const jsonl = path.join(sessionMeta.dir, "gep.jsonl");
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(fs.existsSync(jsonl) ? fs.readFileSync(jsonl, "utf8") : "");
          return;
        }

        json(res, 404, { error: "not found" });
      });

      server.on("error", reject);
      server.listen(port, () => resolve());
    });
  }

  function stop() {
    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }

  return { start, stop, attachSession, detachSession, getSession };
}

module.exports = { createDaemonServer, createSessionServer: createDaemonServer };
