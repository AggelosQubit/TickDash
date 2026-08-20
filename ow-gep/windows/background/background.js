"use strict";

const LOL = 5426;
const PUSH = "http://127.0.0.1:3789/gep/push";
const LIVE_CLIENT = "https://127.0.0.1:2999/liveclientdata/allgamedata";

const FEATURES = [
  "damage",
  "counters",
  "team_frames",
  "jungle_camps",
  "kill",
  "death",
  "assist",
  "heal",
  "level",
  "summoner_info",
  "matchState",
  "match_info",
];

let pollTimers = [];

function itemGoldOw(items) {
  const list = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items)
      : [];
  return list.reduce(
    (sum, it) => sum + Number(it?.price || 0) * Number(it?.count || 1),
    0
  );
}

function mapLcItemsOw(items) {
  const list = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items).filter((x) => x && typeof x === "object")
      : [];
  return list
    .map((it) => ({
      itemID: Number(it?.itemID || 0),
      displayName: it?.displayName || null,
      slot: Number(it?.slot ?? -1),
    }))
    .filter((it) => it.itemID > 0);
}

function push(payload) {
  fetch(PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log("[TickDash OW] push ok", payload.type, payload.feature || "");
    })
    .catch((err) => console.warn("[TickDash OW] push fail", err.message));
}

function pushStatus(extra) {
  push({
    type: "ow-status",
    state: { at: new Date().toISOString(), ...extra },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setFeatures() {
  for (let i = 1; i <= 12; i += 1) {
    const result = await new Promise((resolve) => {
      overwolf.games.events.setRequiredFeatures(FEATURES, resolve);
    });
    if (result && result.success) {
      console.log("[TickDash OW] features OK", result.supportedFeatures);
      pushStatus({ featuresOk: true, supported: result.supportedFeatures || [] });
      return result;
    }
    console.warn("[TickDash OW] features retry", i, result);
    await sleep(3000);
  }
  pushStatus({ featuresOk: false });
  return null;
}

function pushInfoFeature(feature, infoObj) {
  push({
    type: "info",
    at: new Date().toISOString(),
    feature,
    info: infoObj,
  });
}

function onInfoUpdates2(update) {
  if (!update || !update.info) return;
  if (update.feature === "damage") {
    console.log("[TickDash OW] damage update", update.info);
  }
  pushInfoFeature(update.feature, update.info);
}

function onNewEvents(event) {
  if (!event || !event.events) return;
  for (const ev of event.events) {
    if (event.feature === "damage") {
      console.log("[TickDash OW] damage event", ev.name, ev.data);
    }
    push({
      type: "event",
      at: new Date().toISOString(),
      name: ev.name,
      data: ev.data,
      feature: event.feature,
    });
  }
}

function pullCurrentInfo() {
  overwolf.games.events.getInfo((result) => {
    if (!result || !result.success || !result.res) {
      console.warn("[TickDash OW] getInfo fail", result);
      return;
    }
    for (const block of result.res) {
      if (!block.info) continue;
      if (block.feature === "damage") {
        console.log("[TickDash OW] getInfo damage", block.info);
      }
      pushInfoFeature(block.feature, block.info);
    }
    pushStatus({ getInfo: true });
  });
}

function pullDmgShareFromLiveClient() {
  fetch(LIVE_CLIENT)
    .then((r) => r.json())
    .then((data) => {
      const players = asArray(data.allPlayers);
      if (!players.length) return;

      const activeName = (data.activePlayer?.summonerName || "").toLowerCase();
      const gameTime = Number(data.gameData?.gameTime ?? 0);

      const rows = players.map((p) => {
        const items = itemGoldOw(p.items);
            const isMe = (p.summonerName || "").toLowerCase() === activeName;
            const name = p.riotIdGameName || (p.summonerName || "?").split("#")[0];
            return {
              name,
              champion: p.championName || "?",
              team: p.team || "ORDER",
              gold: Math.round(items),
              itemsGold: Math.round(items),
              items: mapLcItemsOw(p.items),
              cs: Number(p.scores?.creepScore ?? 0),
              level: Number(p.level ?? 1),
              isMe,
              isBot: !!p.isBot,
              isDead: !!p.isDead,
              respawnTimer: Number(p.respawnTimer ?? 0),
              position: p.position || "NONE",
              kills: Number(p.scores?.kills ?? 0),
              deaths: Number(p.scores?.deaths ?? 0),
              assists: Number(p.scores?.assists ?? 0),
            };
          });

          const teamGold = {};
          for (const row of rows) teamGold[row.team] = (teamGold[row.team] || 0) + row.gold;

          const me =
            rows.find((p) => p.isMe) ||
            players.find((p) => !p.isBot) ||
            players[0];
          const champDmg = Number(me?.scores?.totalDamageDealtToChampions ?? 0);
          const teamDmg = players
            .filter((p) => p.team === me?.team)
            .reduce((sum, p) => sum + Number(p.scores?.totalDamageDealtToChampions ?? 0), 0);
          const share = teamDmg > 0 ? champDmg / teamDmg : null;

          pushInfoFeature("tickdash", {
            polledAt: new Date().toISOString(),
            gameTime: Number.isFinite(gameTime) ? gameTime : undefined,
            players: rows,
            maxGold: Math.max(...rows.map((r) => r.gold), 1),
            teamGold,
            damage_share: share,
            champ_dmg: champDmg,
            team_dmg: teamDmg,
          });
          pushStatus({ liveClient: Number.isFinite(gameTime), damage_share: share });
        })
    .catch((err) => {
      pushStatus({ liveClient: false, error: err.message });
    });
}

function clearPollers() {
  for (const t of pollTimers) clearInterval(t);
  pollTimers = [];
}

async function onGame(info) {
  if (!info || !info.isRunning || info.classId !== LOL) return;
  clearPollers();
  pushStatus({ game: "lol", title: info.title });
  await setFeatures();
  await ensureItemPrices();
  pullCurrentInfo();
  pullDmgShareFromLiveClient();
  pollTimers.push(setInterval(pullCurrentInfo, 5000));
  pollTimers.push(setInterval(pullDmgShareFromLiveClient, 1000));
  pollTimers.push(setInterval(() => pushStatus({ heartbeat: true }), 15000));
}

overwolf.games.events.onInfoUpdates2.addListener(onInfoUpdates2);
overwolf.games.events.onNewEvents.addListener(onNewEvents);
overwolf.games.onGameInfoUpdated.addListener(onGame);
overwolf.games.onGameLaunched.addListener(onGame);
overwolf.games.getRunningGameInfo(onGame);

console.log("[TickDash OW] background started");
pushStatus({ started: true });
