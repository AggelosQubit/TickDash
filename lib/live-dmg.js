"use strict";

const https = require("https");
const { fetchGamestats } = require("./detect-game");
const { itemGold } = require("./item-gold");
const { mapLcItems } = require("./map-lc-items");
const { KillProximityTracker } = require("./kill-proximity");

const agent = new https.Agent({ rejectUnauthorized: false });

function fetchAllGameData() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "127.0.0.1",
        port: 2999,
        path: "/liveclientdata/allgamedata",
        agent,
        timeout: 3000,
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

function computeDmgShare(data) {
  const players = asPlayerList(data.allPlayers);
  if (!players.length) return null;

  const activeName = (data.activePlayer?.summonerName || "").toLowerCase();
  const me =
    players.find((p) => (p.summonerName || "").toLowerCase() === activeName) ||
    players.find((p) => !p.isBot) ||
    players[0];
  if (!me) return null;

  const champDmg = Number(me.scores?.totalDamageDealtToChampions ?? 0);
  const teamDmg = players
    .filter((p) => p.team === me.team)
    .reduce((sum, p) => sum + Number(p.scores?.totalDamageDealtToChampions ?? 0), 0);

  const damageShare = teamDmg > 0 ? champDmg / teamDmg : null;
  return { damage_share: damageShare, champ_dmg: champDmg, team_dmg: teamDmg };
}

function asArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return Object.values(val).filter((x) => x && typeof x === "object");
  return [];
}

function asPlayerList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "object") {
    if (Array.isArray(raw.players)) return raw.players.filter(Boolean);
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0].filter(Boolean);
    return vals.filter((x) => x && typeof x === "object" && (x.championName || x.summonerName || x.riotId));
  }
  return [];
}


function playerCombatStats(p) {
  let scores = p.scores;
  if (typeof scores === "string") {
    try {
      scores = JSON.parse(scores);
    } catch {
      scores = null;
    }
  }
  return {
    kills: Number(scores?.kills ?? p.kills ?? 0),
    deaths: Number(scores?.deaths ?? p.deaths ?? 0),
    assists: Number(scores?.assists ?? p.assists ?? 0),
  };
}

function mapPlayerRow(p, activeName) {
  const isMe = (p.summonerName || "").toLowerCase() === activeName;
  let itemsGoldVal = 0;
  try {
    itemsGoldVal = Math.round(itemGold(p.items));
  } catch {
    itemsGoldVal = 0;
  }
  const combat = playerCombatStats(p);
  return {
    name: playerDisplayName(p),
    champion: p.championName || "?",
    team: p.team || "ORDER",
    gold: itemsGoldVal,
    itemsGold: itemsGoldVal,
    items: mapLcItems(p.items),
    cs: Number(p.scores?.creepScore ?? 0),
    level: Number(p.level ?? 1),
    isMe,
    isBot: !!p.isBot,
    isDead: !!p.isDead,
    respawnTimer: Number(p.respawnTimer ?? 0),
    position: p.position || "NONE",
    ...combat,
  };
}

/** Roster + respawn — ne touche pas aux items (safe Practice Tool) */
function computeLiveRoster(data) {
  const players = asPlayerList(data.allPlayers);
  if (!players.length) return null;

  const activeName = (data.activePlayer?.summonerName || "").toLowerCase();
  const gameTime = Number(data.gameData?.gameTime ?? 0);
  const rows = players.map((p) => {
    const isMe = (p.summonerName || "").toLowerCase() === activeName;
    const combat = playerCombatStats(p);
    return {
      name: playerDisplayName(p),
      champion: p.championName || "?",
      team: p.team || "ORDER",
      gold: 0,
      cs: Number(p.scores?.creepScore ?? 0),
      level: Number(p.level ?? 1),
      isMe,
      isBot: !!p.isBot,
      isDead: !!p.isDead,
      respawnTimer: Number(p.respawnTimer ?? 0),
      position: p.position || "NONE",
      ...combat,
    };
  });

  const teamGold = {};
  for (const row of rows) teamGold[row.team] = teamGold[row.team] || 0;

  return {
    gameTime,
    players: rows,
    teamGold,
    maxGold: 1,
  };
}

function playerDisplayName(p) {
  if (p.riotIdGameName) return p.riotIdGameName;
  const raw = p.summonerName || p.riotId || "?";
  return raw.split("#")[0];
}

function computeEconomy(data) {
  const players = asPlayerList(data.allPlayers);
  if (!players.length) return null;

  const activeName = (data.activePlayer?.summonerName || "").toLowerCase();
  const gameTime = Number(data.gameData?.gameTime ?? 0);
  const rows = players.map((p) => mapPlayerRow(p, activeName));

  const teamGold = {};
  for (const row of rows) {
    teamGold[row.team] = (teamGold[row.team] || 0) + row.gold;
  }

  return {
    gameTime,
    players: rows,
    teamGold,
    maxGold: Math.max(...rows.map((r) => r.gold), 1),
  };
}

let liveSnapshot = null;
let liveSnapshotError = null;

function getLiveSnapshot() {
  return liveSnapshot;
}

function getLiveSnapshotError() {
  return liveSnapshotError;
}

function setLiveSnapshot(economy, polledAt) {
  liveSnapshot = { ok: true, polledAt, ...economy };
  liveSnapshotError = null;
}

function setLiveSnapshotError(message) {
  liveSnapshot = null;
  liveSnapshotError = message;
}

function clearLiveSnapshot() {
  liveSnapshot = null;
  liveSnapshotError = null;
}

class LiveDmgPoller {
  constructor(tail, intervalMs = 1000) {
    this.tail = tail;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastError = null;
    this.errorLogged = false;
    this.killProximity = new KillProximityTracker();
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    try {
      const data = await fetchAllGameData();
      const gameTime = Number(data.gameData?.gameTime);
      const polledAt = new Date().toISOString();

      let economy = null;
      try {
        economy = computeEconomy(data);
      } catch (err) {
        console.warn(`[TickDash] economy: ${err.message}`);
      }
      if (!economy?.players?.length) economy = computeLiveRoster(data);

      let share = null;
      try {
        share = computeDmgShare(data);
      } catch {
        /* optional */
      }

      if (!economy?.players?.length && !Number.isFinite(gameTime) && !share?.champ_dmg) return;

      this.errorLogged = false;
      this.lastError = null;
      setLiveSnapshot(economy, polledAt);

      const info = { polledAt };
      if (Number.isFinite(gameTime)) info.gameTime = gameTime;
      if (economy) {
        info.economy = economy;
        info.players = economy.players;
        info.maxGold = economy.maxGold;
        info.teamGold = economy.teamGold;
      }
      if (share && (share.champ_dmg > 0 || share.team_dmg > 0)) Object.assign(info, share);

      this.tail.push({
        type: "info",
        at: new Date().toISOString(),
        feature: "tickdash",
        info,
      });
      this.tail.push({
        type: "ow-status",
        state: {
          liveClient: Number.isFinite(gameTime),
          source: "daemon",
          damage_share: share?.damage_share ?? null,
        },
      });

      const proximity = this.killProximity.process(data);
      if (proximity.changed) {
        this.tail.recordKillProximity(proximity.stats, proximity.records);
      }
    } catch (err) {
      this.lastError = err.message;
      setLiveSnapshotError(err.message);
      if (!this.errorLogged) {
        this.errorLogged = true;
        console.warn(`[TickDash] Live Client (:2999): ${err.message}`);
      }
    }
  }
}

module.exports = {
  LiveDmgPoller,
  fetchAllGameData,
  computeDmgShare,
  computeEconomy,
  computeLiveRoster,
  itemGold,
  getLiveSnapshot,
  getLiveSnapshotError,
  setLiveSnapshot,
  clearLiveSnapshot,
};
