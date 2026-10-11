"use strict";

const https = require("https");
const { lcuGet } = require("./lcu");

const ROLE_KEY = {
  TOP: "4",
  JUNGLE: "1",
  MIDDLE: "5",
  BOTTOM: "3",
  UTILITY: "2",
};

const ROLE_LABEL = {
  4: "Top",
  1: "Jgl",
  5: "Mid",
  3: "Adc",
  2: "Sup",
};

const IDLE = new Set(["None", "Lobby", "Matchmaking", "ReadyCheck"]);

let build = null;
let loading = null;
let loadedKey = "";
let failKey = "";
let ddragonVersion = "";
let itemNames = null;
let championNames = null;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "TickDash", Accept: "application/json" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        getJson(res.headers.location).then(resolve, reject);
        return;
      }
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
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function patchVersion() {
  if (ddragonVersion) return ddragonVersion;
  const versions = await getJson("https://ddragon.leagueoflegends.com/api/versions.json");
  ddragonVersion = Array.isArray(versions) && versions[0] ? versions[0] : "";
  return ddragonVersion;
}

function uggPatch(version) {
  const parts = String(version || "").split(".");
  if (parts.length < 2) return "";
  return `${parts[0]}_${parts[1]}`;
}

function previousPatch(version) {
  const parts = String(version || "").split(".");
  const minor = Number(parts[1]);
  if (!Number.isFinite(minor) || minor <= 1) return "";
  return `${parts[0]}.${minor - 1}.1`;
}

async function ensureCatalogs(version) {
  if (!itemNames) {
    const items = await getJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/item.json`);
    itemNames = items?.data || {};
  }
  if (!championNames) {
    const champs = await getJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion.json`);
    championNames = {};
    const data = champs?.data || {};
    for (const champ of Object.values(data)) {
      if (champ?.key) championNames[String(champ.key)] = champ.name || champ.id;
    }
  }
}

function rankedOptions(options) {
  return (Array.isArray(options) ? options : [])
    .filter((row) => Array.isArray(row) && Number(row[0]) > 0)
    .sort((a, b) => Number(b[2]) - Number(a[2]))
    .map((row) => Number(row[0]));
}

function finalItemIds(row) {
  if (!Array.isArray(row)) return [];
  const core = Array.isArray(row[3]?.[2]) ? row[3][2] : [];
  const slots = Array.isArray(row[5]) ? row[5] : [];
  const ids = [];
  const push = (id) => {
    const n = Number(id);
    if (!n || ids.includes(n)) return false;
    ids.push(n);
    return true;
  };
  for (const id of core) push(id);
  for (let i = 0; i < 3 && ids.length < 6; i++) {
    for (const id of rankedOptions(slots[i])) {
      if (push(id)) break;
    }
  }
  return ids.slice(0, 6);
}

function rowMatches(row) {
  const box = row?.[6];
  return Array.isArray(box) ? Number(box[1]) || 0 : 0;
}

function pickRow(overview, position) {
  const region = overview?.["12"] || overview?.["1"];
  if (!region) return null;
  const rank = region["8"] || region[Object.keys(region)[0]];
  if (!rank) return null;
  const wanted = ROLE_KEY[String(position || "").toUpperCase()];
  if (wanted && Array.isArray(rank[wanted]?.[0])) return { row: rank[wanted][0], role: wanted };
  let best = null;
  let bestRole = "";
  let bestN = -1;
  for (const role of Object.keys(rank)) {
    const row = rank[role]?.[0];
    const n = rowMatches(row);
    if (n > bestN) {
      bestN = n;
      best = row;
      bestRole = role;
    }
  }
  return best ? { row: best, role: bestRole } : null;
}

async function fetchOverview(championId, version) {
  const patches = [uggPatch(version)];
  const older = uggPatch(previousPatch(version));
  if (older) patches.push(older);
  for (const patch of patches) {
    if (!patch) continue;
    const url = `https://stats2.u.gg/lol/1.5/overview/${patch}/ranked_solo_5x5/${championId}/1.5.0.json`;
    const data = await getJson(url);
    if (data) return { data, patch };
  }
  return null;
}

function toItems(ids, version) {
  return ids.map((id) => {
    const meta = itemNames?.[String(id)];
    return {
      id,
      name: meta?.name || String(id),
      icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`,
    };
  });
}

async function loadBuild(championId, position, log) {
  const version = await patchVersion();
  if (!version) return;
  await ensureCatalogs(version);
  const overview = await fetchOverview(championId, version);
  if (!overview) {
    build = {
      championId,
      champion: championNames?.[String(championId)] || String(championId),
      role: "",
      items: [],
      error: "build indisponible",
    };
    return;
  }
  const picked = pickRow(overview.data, position);
  const ids = picked ? finalItemIds(picked.row) : [];
  build = {
    championId,
    champion: championNames?.[String(championId)] || String(championId),
    role: picked ? ROLE_LABEL[picked.role] || "" : "",
    patch: overview.patch.replace("_", "."),
    items: toItems(ids, version),
    error: ids.length ? "" : "build indisponible",
  };
  if (ids.length) {
    log(`Build ${build.champion} ${build.role} → ${build.items.map((it) => it.name).join(" · ")}`);
  }
}

async function localChampion() {
  const me = await lcuGet("/lol-summoner/v1/current-summoner");
  const puuid = me?.puuid || "";
  if (!puuid) return null;
  const cs = await lcuGet("/lol-champ-select/v1/session");
  const mine = cs?.myTeam?.find((p) => p && p.puuid === puuid);
  const fromCs = Number(mine?.championId || mine?.championPickIntent || 0);
  if (fromCs > 0) return { championId: fromCs, position: mine?.assignedPosition || "" };
  const flow = await lcuGet("/lol-gameflow/v1/session");
  const picks = flow?.gameData?.playerChampionSelections || [];
  const pick = picks.find((p) => p && p.puuid === puuid);
  const fromGame = Number(pick?.championId || 0);
  if (fromGame > 0) return { championId: fromGame, position: mine?.assignedPosition || "" };
  return null;
}

function noteChampionBuild(phase, log) {
  const write = log || (() => {});
  if (IDLE.has(phase)) {
    build = null;
    loadedKey = "";
    failKey = "";
    return Promise.resolve();
  }
  loading = (loading || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const champ = await localChampion();
      if (!champ) return;
      const key = `${champ.championId}:${String(champ.position || "").toUpperCase()}`;
      if (key === loadedKey || key === failKey) return;
      try {
        await loadBuild(champ.championId, champ.position, write);
        if (build?.items?.length) loadedKey = key;
        else failKey = key;
      } catch (err) {
        failKey = key;
        write(`Build FAIL: ${err.message}`);
      }
    });
  return loading;
}

function getChampionBuild() {
  if (!build) return null;
  return {
    championId: build.championId,
    champion: build.champion,
    role: build.role,
    patch: build.patch || "",
    items: build.items || [],
    error: build.error || "",
  };
}

module.exports = { noteChampionBuild, getChampionBuild, finalItemIds, pickRow };
