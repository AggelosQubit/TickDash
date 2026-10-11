"use strict";

const { lcuGet } = require("./lcu");

const GAME_PHASES = new Set(["GameStart", "InProgress", "Reconnect", "PreEndOfGame", "WaitingForStats", "EndOfGame"]);
const IDLE_PHASES = new Set(["None", "Matchmaking", "ReadyCheck"]);

const TIER_FR = {
  IRON: "Fer",
  BRONZE: "Bronze",
  SILVER: "Argent",
  GOLD: "Or",
  PLATINUM: "Plat",
  EMERALD: "Émeraude",
  DIAMOND: "Diamant",
  MASTER: "Master",
  GRANDMASTER: "GM",
  CHALLENGER: "Chall",
};

const POS = {
  TOP: "Top",
  JUNGLE: "Jgl",
  MIDDLE: "Mid",
  BOTTOM: "Adc",
  UTILITY: "Sup",
};

let phaseSeen = "idle";
let allies = [];
let opponents = [];
let alliesDone = false;
let opponentsDone = false;
let busy = null;
let lastLog = () => {};
const rankCache = new Map();

function pickSolo(stats) {
  if (!stats || typeof stats !== "object") return null;
  const map = stats.queueMap;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return map.RANKED_SOLO_5x5 || map.RANKED_SOLO || null;
  }
  const queues = Array.isArray(stats.queues) ? stats.queues : [];
  return queues.find((q) => q && (q.queueType === "RANKED_SOLO_5x5" || q.queueType === "RANKED_SOLO")) || null;
}

function formatSolo(solo) {
  if (!solo || !solo.tier || solo.tier === "NONE" || solo.tier === "UNRANKED") {
    return { label: "Non classé", tier: null, division: null, lp: null };
  }
  const tier = TIER_FR[String(solo.tier).toUpperCase()] || solo.tier;
  const division = solo.division && solo.division !== "NA" ? solo.division : "";
  const lp = Number.isFinite(Number(solo.leaguePoints)) ? Number(solo.leaguePoints) : null;
  const head = division ? `${tier} ${division}` : tier;
  const label = lp == null ? head : `${head} · ${lp} LP`;
  return { label, tier: solo.tier, division: division || null, lp };
}

function personName(raw, summoner) {
  const game = summoner?.gameName || raw?.gameName || "";
  const tag = summoner?.tagLine || raw?.tagLine || "";
  if (game && tag) return `${game}#${tag}`;
  if (game) return game;
  const legacy = summoner?.displayName || summoner?.internalName || raw?.summonerName || raw?.name || "";
  return legacy || "—";
}

async function summonerFor(raw) {
  const puuid = raw?.puuid || "";
  const summonerId = Number(raw?.summonerId || raw?.summonerID || 0);
  if (puuid) {
    const byPuuid = await lcuGet(`/lol-summoner/v1/summoners-by-puuid/${encodeURIComponent(puuid)}`);
    if (byPuuid) return byPuuid;
    const v2 = await lcuGet(`/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`);
    if (v2) return v2;
  }
  if (summonerId) return lcuGet(`/lol-summoner/v1/summoners/${summonerId}`);
  return null;
}

async function rankFor(puuid) {
  if (!puuid) return { label: "—", tier: null, division: null, lp: null, pending: false };
  if (rankCache.has(puuid)) return rankCache.get(puuid);
  const stats = await lcuGet(`/lol-ranked/v1/ranked-stats/${encodeURIComponent(puuid)}`);
  if (!stats) return { label: "…", tier: null, division: null, lp: null, pending: true };
  const formatted = { ...formatSolo(pickSolo(stats)), pending: false };
  rankCache.set(puuid, formatted);
  return formatted;
}

async function describe(raw) {
  const summoner = await summonerFor(raw);
  const puuid = summoner?.puuid || raw?.puuid || "";
  const rank = await rankFor(puuid);
  const position = POS[String(raw?.assignedPosition || raw?.selectedPosition || "").toUpperCase()] || "";
  return {
    puuid,
    name: personName(raw, summoner),
    position,
    label: rank.label,
    tier: rank.tier,
    division: rank.division,
    lp: rank.lp,
    pending: !!rank.pending,
  };
}

function identifiable(list) {
  return Array.isArray(list) ? list.filter((p) => p && (p.puuid || p.summonerId || p.gameName || p.summonerName)) : [];
}

async function describeAll(list) {
  const rows = identifiable(list);
  return Promise.all(rows.map((raw) => describe(raw)));
}

function teamsOf(session) {
  const data = session?.gameData || session || {};
  const one = data.teamOne || data.team1 || [];
  const two = data.teamTwo || data.team2 || [];
  return [one, two].filter((team) => Array.isArray(team) && team.length);
}

async function currentPuuid() {
  const me = await lcuGet("/lol-summoner/v1/current-summoner");
  return me?.puuid || "";
}

function logRoster(log, title, rows) {
  log(`${title} → ${rows.map((p) => `${p.position || "?"} ${p.name} ${p.label}`).join(" | ")}`);
}

async function ensureAllies(log) {
  const session = await lcuGet("/lol-champ-select/v1/session");
  const myTeam = session?.myTeam || [];
  if (!myTeam.length) return;
  const next = await describeAll(myTeam);
  if (!next.length) return;
  const wasDone = alliesDone;
  allies = next.length >= allies.length ? next : allies;
  alliesDone = identifiable(myTeam).length >= 5 && allies.length >= 5 && allies.every((p) => !p.pending);
  if (alliesDone && !wasDone) logRoster(log, "Rangs alliés", allies);
}

async function ensureOpponents(log) {
  const session = await lcuGet("/lol-gameflow/v1/session");
  const teams = teamsOf(session);
  if (teams.length < 2) return;
  const me = await currentPuuid();
  const described = await Promise.all(teams.map((team) => describeAll(team)));
  let mine = described.find((team) => me && team.some((p) => p.puuid === me));
  if (!mine && allies.length) {
    const known = new Set(allies.map((p) => p.puuid).filter(Boolean));
    mine = described.find((team) => team.some((p) => known.has(p.puuid)));
  }
  const theirs = described.find((team) => team !== mine) || described[1] || [];
  if (mine?.length) {
    const wasDone = alliesDone;
    allies = mine;
    alliesDone = mine.every((p) => !p.pending);
    if (alliesDone && !wasDone) logRoster(log, "Rangs alliés", allies);
  }
  if (!theirs.length) return;
  const oppWereDone = opponentsDone;
  opponents = theirs;
  opponentsDone = theirs.every((p) => !p.pending);
  if (opponentsDone && !oppWereDone) logRoster(log, "Rangs adversaires", theirs);
}

function noteLobbyPhase(phase, log) {
  if (log) lastLog = log;
  const write = lastLog;
  const run = async () => {
    if (phase === "ChampSelect") {
      if (phaseSeen !== "ChampSelect") {
        phaseSeen = "ChampSelect";
        allies = [];
        opponents = [];
        opponentsDone = false;
        alliesDone = false;
        rankCache.clear();
      }
      if (!alliesDone) await ensureAllies(write);
      return;
    }
    if (GAME_PHASES.has(phase)) {
      phaseSeen = phase;
      if (!alliesDone || !opponentsDone) await ensureOpponents(write);
      return;
    }
    if (IDLE_PHASES.has(phase)) {
      if (phaseSeen !== "idle") {
        phaseSeen = "idle";
        allies = [];
        opponents = [];
        alliesDone = false;
        opponentsDone = false;
        rankCache.clear();
      }
    }
  };
  busy = (busy || Promise.resolve()).catch(() => {}).then(run);
  return busy;
}

function reloadRanks() {
  const run = async () => {
    rankCache.clear();
    alliesDone = false;
    opponentsDone = false;
    const phase = await lcuGet("/lol-gameflow/v1/gameflow-phase");
    const name = typeof phase === "string" ? phase : "";
    if (name === "ChampSelect") {
      phaseSeen = "ChampSelect";
      allies = [];
      opponents = [];
      opponentsDone = false;
      await ensureAllies(lastLog);
      return getLobbyRanks();
    }
    await ensureOpponents(lastLog);
    return getLobbyRanks();
  };
  busy = (busy || Promise.resolve()).catch(() => {}).then(run);
  return busy;
}

function getLobbyRanks() {
  const pub = (row) => ({
    name: row.name,
    position: row.position,
    label: row.label,
    tier: row.tier,
    division: row.division,
    lp: row.lp,
  });
  return {
    allies: allies.map(pub),
    opponents: opponents.map(pub),
  };
}

module.exports = { noteLobbyPhase, getLobbyRanks, reloadRanks, formatSolo, pickSolo };
