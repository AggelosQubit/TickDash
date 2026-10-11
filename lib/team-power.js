"use strict";

function kdaAvg(k, d, a) {
  if (d === 0) return k + a;
  return (k + a) / d;
}

function teamKillTotal(players, team) {
  return players
    .filter((p) => p.team === team)
    .reduce((s, p) => s + Number(p.kills || 0), 0);
}

/** Même mix que le dashboard (scoreLobbyMix dans public/index.html). */
function scoreLobbyMix(players) {
  if (!players?.length) return null;
  const scored = players.map((p) => {
    const k = Number(p.kills || 0);
    const d = Number(p.deaths || 0);
    const a = Number(p.assists || 0);
    const tk = teamKillTotal(players, p.team);
    const kda = kdaAvg(k, d, a);
    const kp = tk > 0 ? Math.min(100, ((k + a) / tk) * 100) : 0;
    return { ...p, k, d, a, kda, kp };
  });
  const maxGold = Math.max(...scored.map((s) => Number(s.gold || 0)), 0.001);
  const maxKda = Math.max(...scored.map((s) => s.kda), 0.001);
  const maxKp = Math.max(...scored.map((s) => s.kp), 0.001);
  const maxCs = Math.max(...scored.map((s) => Number(s.cs || 0)), 0.001);
  const maxLevel = Math.max(...scored.map((s) => Number(s.level || 1)), 1);
  for (const s of scored) {
    const goldNorm = Number(s.gold || 0) / maxGold;
    const kdaNorm = s.kda / maxKda;
    const kpNorm = s.kp / maxKp;
    const csNorm = Number(s.cs || 0) / maxCs;
    const levelNorm = Number(s.level || 1) / maxLevel;
    s.mix = (goldNorm * 0.1 + kdaNorm * 0.35 + kpNorm * 0.15 + csNorm * 0.2 + levelNorm * 0.2) * 100;
  }
  const totals = { ORDER: 0, CHAOS: 0 };
  for (const s of scored) {
    if (s.team === "ORDER" || s.team === "CHAOS") totals[s.team] += Math.round(s.mix);
  }
  return { totals };
}

function formatScalar(us, them) {
  return `TEAM POWER SCALAR : { ${us}:US  ; ${them}:THEM }`;
}

function teamPowerSample(players, gameTime) {
  const lobby = scoreLobbyMix(players);
  if (!lobby) return null;
  const me = players.find((p) => p.isMe);
  const myTeam = me?.team;
  if (myTeam !== "ORDER" && myTeam !== "CHAOS") return null;
  const enemy = myTeam === "ORDER" ? "CHAOS" : "ORDER";
  const us = lobby.totals[myTeam];
  const them = lobby.totals[enemy];
  const minute = Number.isFinite(Number(gameTime)) ? Math.floor(Number(gameTime) / 60) : null;
  return {
    min: minute,
    us,
    them,
    line: formatScalar(us, them),
    at: new Date().toISOString(),
  };
}

function teamPowerScalarLine(players) {
  return teamPowerSample(players)?.line || null;
}

const TEAM_POWER_INTRO =
  "Hello team, sorry. From time to time I'll paste our power vs theirs. TEAM POWER SCALAR : { XX:US  ; YY:THEM } Higher number = stronger team.";

function teamPowerIntroLine() {
  return TEAM_POWER_INTRO;
}

module.exports = {
  scoreLobbyMix,
  formatScalar,
  teamPowerSample,
  teamPowerScalarLine,
  TEAM_POWER_INTRO,
  teamPowerIntroLine,
};
