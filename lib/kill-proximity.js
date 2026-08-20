"use strict";

function normName(raw) {
  return (raw || "").toLowerCase().split("#")[0].trim();
}

function displayName(p) {
  if (p.riotIdGameName) return p.riotIdGameName;
  return (p.summonerName || "?").split("#")[0];
}

function asPlayerList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "object") {
    if (Array.isArray(raw.players)) return raw.players.filter(Boolean);
    return Object.values(raw).filter((x) => x && typeof x === "object" && (x.championName || x.summonerName));
  }
  return [];
}

function meKeys(activePlayer) {
  const keys = new Set();
  for (const raw of [
    activePlayer?.summonerName,
    activePlayer?.riotIdGameName,
    activePlayer?.riotIdGameName && activePlayer?.riotIdTagLine
      ? `${activePlayer.riotIdGameName}#${activePlayer.riotIdTagLine}`
      : null,
  ]) {
    const key = normName(raw);
    if (key) keys.add(key);
  }
  return keys;
}

function playerIsMe(p, keys) {
  for (const raw of [p.summonerName, p.riotIdGameName, displayName(p)]) {
    if (keys.has(normName(raw))) return true;
  }
  return false;
}

function buildRoster(allPlayers, activePlayer) {
  const keys = meKeys(activePlayer);
  const byKey = new Map();
  for (const p of asPlayerList(allPlayers)) {
    const entry = {
      name: displayName(p),
      champion: p.championName || "?",
      team: p.team || "ORDER",
      isMe: playerIsMe(p, keys),
      isBot: !!p.isBot,
    };
    for (const alias of [p.summonerName, p.riotIdGameName, entry.name]) {
      const key = normName(alias);
      if (key) byKey.set(key, entry);
    }
  }
  return byKey;
}

function isSamePlayer(a, b) {
  if (!a || !b) return false;
  if (a.isMe && b.isMe) return true;
  if (a.isMe || b.isMe) return a === b;
  return normName(a.name) === normName(b.name);
}

function emptyStats() {
  return { pairs: {}, ranking: [], topMate: null, updatedAt: null };
}

class KillProximityTracker {
  constructor() {
    this.seenEventIds = new Set();
    this.stats = emptyStats();
  }

  reset() {
    this.seenEventIds.clear();
    this.stats = emptyStats();
  }

  bump(mate, field) {
    const key = mate.name;
    if (!this.stats.pairs[key]) {
      this.stats.pairs[key] = {
        name: mate.name,
        champion: mate.champion,
        together: 0,
        myKillsTheyAssisted: 0,
        theirKillsIAssisted: 0,
      };
    }
    const row = this.stats.pairs[key];
    row[field] += 1;
    row.together += 1;
    if (mate.champion && mate.champion !== "?") row.champion = mate.champion;
  }

  recomputeRanking(me) {
    const ranking = Object.values(this.stats.pairs)
      .filter((p) => !me || !isSamePlayer(p, me))
      .sort((a, b) => {
        if (b.together !== a.together) return b.together - a.together;
        return a.name.localeCompare(b.name);
      });
    this.stats.ranking = ranking;
    this.stats.topMate = ranking[0] || null;
  }

  process(data) {
    const events = data?.events?.Events;
    if (!Array.isArray(events) || !events.length) return { changed: false, stats: this.stats, records: [] };

    const roster = buildRoster(data.allPlayers, data.activePlayer);
    const me = [...new Set(roster.values())].find((e) => e.isMe);
    if (!me) return { changed: false, stats: this.stats, records: [] };

    const records = [];
    let changed = false;

    for (const ev of events) {
      if (ev.EventName !== "ChampionKill") continue;
      if (this.seenEventIds.has(ev.EventID)) continue;
      this.seenEventIds.add(ev.EventID);

      const killerKey = normName(ev.KillerName);
      const killer = roster.get(killerKey);
      const assistersRaw = (ev.Assisters || [])
        .map((name) => roster.get(normName(name)))
        .filter(Boolean);
      const assisters = assistersRaw.filter(
        (a) => normName(a.name) !== killerKey && !isSamePlayer(a, killer) && !isSamePlayer(a, me)
      );

      if (killer?.isMe) {
        for (const mate of assisters) {
          if (mate.team !== me.team || mate.isMe || isSamePlayer(mate, me)) continue;
          this.bump(mate, "myKillsTheyAssisted");
          records.push({
            kind: "my_kill",
            mate: mate.name,
            champion: mate.champion,
            victim: ev.VictimName || null,
            gameTime: ev.EventTime,
          });
          changed = true;
        }
      }

      const iAssisted = assistersRaw.some((a) => a.isMe || isSamePlayer(a, me));
      if (iAssisted && killer && killer.team === me.team && !killer.isMe && !isSamePlayer(killer, me)) {
        this.bump(killer, "theirKillsIAssisted");
        records.push({
          kind: "their_kill",
          mate: killer.name,
          champion: killer.champion,
          victim: ev.VictimName || null,
          gameTime: ev.EventTime,
        });
        changed = true;
      }
    }

    if (changed) {
      this.stats.localPlayer = { name: me.name, champion: me.champion };
      this.recomputeRanking(me);
      this.stats.updatedAt = new Date().toISOString();
    }

    return { changed, stats: this.stats, records };
  }
}

module.exports = { KillProximityTracker, buildRoster, normName };
