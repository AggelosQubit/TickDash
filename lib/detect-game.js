"use strict";

const https = require("https");

const agent = new https.Agent({ rejectUnauthorized: false });
const POLL_MS = 2000;
const END_AFTER_FAILS = 3;

function fetchGamestats() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "127.0.0.1",
        port: 2999,
        path: "/liveclientdata/gamestats",
        agent,
        timeout: 2500,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function gameSlug(stats) {
  const mode = slugify(stats.gameMode);
  const map = slugify(stats.mapName || "map");
  return `${mode}-${map}`;
}

/**
 * Waits until Live Client API responds (game running).
 * @returns {Promise<object>} gamestats payload
 */
function waitForGameStart() {
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const stats = await fetchGamestats();
        resolve(stats);
      } catch {
        setTimeout(tick, POLL_MS);
      }
    };
    tick();
  });
}

/**
 * Waits until Live Client API stops responding (game ended).
 */
function waitForGameEnd() {
  return new Promise((resolve) => {
    let fails = 0;
    const tick = async () => {
      try {
        await fetchGamestats();
        fails = 0;
      } catch {
        fails += 1;
        if (fails >= END_AFTER_FAILS) {
          resolve();
          return;
        }
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

module.exports = {
  fetchGamestats,
  gameSlug,
  waitForGameStart,
  waitForGameEnd,
  POLL_MS,
};
