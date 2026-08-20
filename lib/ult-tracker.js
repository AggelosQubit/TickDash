"use strict";

const FRAME_KEY_RE = /^team_frames_(\d+)$/;

function decodeTeams(raw) {
  if (!raw) return [];
  let decoded = raw;
  if (typeof raw === "string") {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return [];
    }
  }
  return Array.isArray(decoded) ? decoded : [];
}

function rosterFromInfo(info) {
  const td = info.tickdash || {};
  if (Array.isArray(td.players) && td.players.length) {
    return td.players.map((p) => ({
      champion: p.champion,
      name: p.name,
      team: p.team,
      isMe: !!p.isMe,
    }));
  }

  const teams = decodeTeams(info.teams?.teams);
  if (teams.length) {
    const si = info.summoner_info || {};
    const myChamp = (si.champion || "").toLowerCase();
    const myName = (si.name || "").toLowerCase();
    return teams.map((t) => {
      const name = (t.summoner || "?").split("#")[0];
      const champion = t.champion || "?";
      return {
        champion,
        name,
        team: t.team === "Chaos" ? "CHAOS" : "ORDER",
        isMe:
          !!myChamp &&
          champion.toLowerCase() === myChamp &&
          name.toLowerCase() === myName,
      };
    });
  }

  return [];
}

function rosterByTeam(roster) {
  const order = roster.filter((p) => p.team === "ORDER");
  const chaos = roster.filter((p) => p.team === "CHAOS");
  return [...order, ...chaos];
}

function parseTeamFrames(info) {
  const tf = info.team_frames || {};
  const out = {};
  for (const [key, val] of Object.entries(tf)) {
    const m = key.match(FRAME_KEY_RE);
    if (!m) continue;
    let parsed = val;
    if (typeof val === "string") {
      try {
        parsed = JSON.parse(val);
      } catch {
        continue;
      }
    }
    const cd = Number(parsed?.ult_cd);
    if (Number.isFinite(cd)) out[Number(m[1])] = cd;
  }
  return out;
}

function champForFrame(frameIdx, roster) {
  const ordered = rosterByTeam(roster);
  if (ordered[frameIdx]) return ordered[frameIdx];
  if (roster[frameIdx]) return roster[frameIdx];
  return { champion: `Slot ${frameIdx}`, name: "?", team: null, isMe: false };
}

function isLocalPlayer(player, info) {
  if (player?.isMe) return true;
  const si = info.summoner_info || {};
  const myChamp = (si.champion || "").toLowerCase();
  const myName = (si.name || "").toLowerCase();
  const champ = (player?.champion || "").toLowerCase();
  const name = (player?.name || "").toLowerCase();
  if (myChamp && champ === myChamp) {
    if (!name || name === "?" || name === myName) return true;
  }
  return false;
}

function ultWasUsed(prevCd, nextCd) {
  if (!Number.isFinite(prevCd) || !Number.isFinite(nextCd)) return false;
  if (prevCd <= 3 && nextCd >= 12) return true;
  if (nextCd - prevCd >= 18 && nextCd >= 18) return true;
  return false;
}

class UltTracker {
  constructor() {
    this.prevCds = {};
    this.lastFired = {};
    this.cooldownMs = 4000;
  }

  detect(info, at) {
    const frames = parseTeamFrames(info);
    const roster = rosterFromInfo(info);
    const events = [];
    const iso = at || new Date().toISOString();
    const now = Date.parse(iso) || Date.now();

    for (const [idxStr, cd] of Object.entries(frames)) {
      const idx = Number(idxStr);
      const prev = this.prevCds[idx];
      if (prev !== undefined && ultWasUsed(prev, cd)) {
        const last = this.lastFired[idx] || 0;
        if (now - last >= this.cooldownMs) {
          const player = champForFrame(idx, roster);
          if (isLocalPlayer(player, info)) {
            this.prevCds[idx] = cd;
            continue;
          }
          events.push({
            type: "event",
            at: iso,
            feature: "tickdash",
            name: "ult_used",
            data: {
              champion: player.champion,
              player: player.name,
              team: player.team,
              frame: idx,
              ult_cd: cd,
              source: "team_frames",
            },
          });
          this.lastFired[idx] = now;
        }
      }
      this.prevCds[idx] = cd;
    }

    return events;
  }

  reset() {
    this.prevCds = {};
    this.lastFired = {};
  }
}

module.exports = {
  UltTracker,
  rosterFromInfo,
  parseTeamFrames,
  champForFrame,
  ultWasUsed,
  isLocalPlayer,
  decodeTeams,
};
