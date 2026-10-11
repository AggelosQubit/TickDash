(function () {
  const STORAGE_KEY = "tickdash:endSnapshot";

  function fmtGold(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  }

  function fmtGameTime(sec) {
    if (sec == null || !Number.isFinite(sec)) return "—";
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function normChamp(c) {
    return (c || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

  function resolveMyTeam(players, info) {
    const me = players.find((p) => p.isMe);
    if (me?.team) return me.team;
    const si = info.summoner_info || {};
    const myChamp = (si.champion || "").toLowerCase();
    const myName = (si.name || "").toLowerCase();
    const byChamp = players.find(
      (p) =>
        (p.champion || "").toLowerCase() === myChamp &&
        (!myName || (p.name || "").toLowerCase().includes(myName))
    );
    if (byChamp?.team) return byChamp.team;
    const order = players.filter((p) => p.team === "ORDER").length;
    const chaos = players.filter((p) => p.team === "CHAOS").length;
    if (order && !chaos) return "ORDER";
    if (chaos && !order) return "CHAOS";
    if (order <= chaos) return "ORDER";
    return "CHAOS";
  }

  function isSupport(p) {
    return (p.position || "").toUpperCase() === "UTILITY";
  }

  function kdaAvg(k, d, a) {
    if (d === 0) return k + a;
    return (k + a) / d;
  }

  function teamKillTotal(players, team) {
    return players.filter((p) => p.team === team).reduce((s, p) => s + Number(p.kills || 0), 0);
  }

  function scorePlayerPool(pool, teamKills) {
    if (!pool.length) return null;
    const kills = Number.isFinite(teamKills) ? teamKills : pool.reduce((s, p) => s + Number(p.kills || 0), 0);
    const scored = pool.map((p) => {
      const k = Number(p.kills || 0);
      const d = Number(p.deaths || 0);
      const a = Number(p.assists || 0);
      const kda = kdaAvg(k, d, a);
      const kp = kills > 0 ? Math.min(100, ((k + a) / kills) * 100) : 0;
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
    scored.sort((a, b) => b.mix - a.mix);
    return { scored };
  }

  /** Mix comparable inter-équipes (normalisation sur les 10 joueurs). */
  function scoreLobbyMix(players) {
    if (!players?.length) return null;
    const scored = players.map((p) => {
      const k = Number(p.kills || 0);
      const d = Number(p.deaths || 0);
      const a = Number(p.assists || 0);
      const teamKills = teamKillTotal(players, p.team);
      const kda = kdaAvg(k, d, a);
      const kp = teamKills > 0 ? Math.min(100, ((k + a) / teamKills) * 100) : 0;
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
      if (s.team === "ORDER" || s.team === "CHAOS") {
        totals[s.team] += Math.round(s.mix);
      }
    }
    scored.sort((a, b) => b.mix - a.mix);
    return { scored, totals };
  }

  function teamPowerDelta(totals, myTeam) {
    if (!totals || !myTeam) return null;
    const enemyTeam = myTeam === "ORDER" ? "CHAOS" : "ORDER";
    const mine = Number(totals[myTeam] || 0);
    const theirs = Number(totals[enemyTeam] || 0);
    const delta = mine - theirs;
    if (delta === 0) return { kind: "even", sign: "", amount: 0, mine, theirs };
    if (delta > 0) return { kind: "benefit", sign: "+", amount: delta, mine, theirs };
    return { kind: "deficit", sign: "−", amount: -delta, mine, theirs };
  }

  function fmtPowerDelta(pd) {
    if (!pd) return "—";
    if (pd.kind === "even") return "Even";
    return `${pd.sign}${pd.amount}`;
  }

  function powerDeltaClass(pd) {
    if (!pd) return "";
    if (pd.kind === "benefit") return "power-up";
    if (pd.kind === "deficit") return "power-down";
    return "even";
  }

  function teamPowerVsHtml(totals, myTeam) {
    if (!totals || !myTeam) return "—";
    const enemy = myTeam === "ORDER" ? "CHAOS" : "ORDER";
    const mine = totals[myTeam] ?? "—";
    const theirs = totals[enemy] ?? "—";
    return `<span class="team-power-us">${mine}</span> / <span class="team-power-them">${theirs}</span>`;
  }

  function teamPowerLabel(power, isMyTeam) {
    if (!Number.isFinite(power)) return "";
    const cls = isMyTeam ? "team-power-us" : "team-power-them";
    return ` · Puiss. <span class="${cls}">${power}</span>`;
  }

  function myPowerIndex(economy, info) {
    if (!economy?.players?.length) return null;
    const myTeam = resolveMyTeam(economy.players, info);
    if (!myTeam) return null;
    const pool = economy.players.filter((p) => p.team === myTeam && !isSupport(p));
    const data = scorePlayerPool(pool, teamKillTotal(economy.players, myTeam));
    if (!data?.scored?.length) return null;
    const me = pool.find((p) => isLocalPlayer(p, info));
    if (!me) return null;
    const row = data.scored.find((s) => normChamp(s.champion) === normChamp(me.champion));
    return row ? Math.round(row.mix) : null;
  }

  function goldDelta(economy, info) {
    if (!economy?.players?.length || !economy.teamGold) return null;
    const myTeam = resolveMyTeam(economy.players, info);
    if (!myTeam) return null;
    const enemyTeam = myTeam === "ORDER" ? "CHAOS" : "ORDER";
    const mine = Number(economy.teamGold[myTeam] || 0);
    const theirs = Number(economy.teamGold[enemyTeam] || 0);
    const delta = mine - theirs;
    if (delta === 0) return { kind: "even", label: "Gold Even", sign: "", amount: 0, mine, theirs };
    if (delta > 0) return { kind: "benefit", label: "Gold Benefit", sign: "+", amount: delta, mine, theirs };
    return { kind: "deficit", label: "Gold Deficit", sign: "−", amount: -delta, mine, theirs };
  }

  function fmtGoldDeltaNav(gd) {
    if (!gd) return "—";
    if (gd.kind === "even") return "Even";
    return `${gd.sign}${fmtGold(gd.amount)}`;
  }

  function teamRowsHtml(scored, team, info) {
    const rows = (scored || []).filter((p) => p.team === team).sort((a, b) => b.mix - a.mix);
    if (!rows.length) return `<div class="pm-empty">—</div>`;
    return rows
      .map(
        (p) => `<div class="pm-row${isLocalPlayer(p, info) ? " me" : ""}">
        <span class="name">${p.champion}</span>
        <span class="kda">${p.k}/${p.d}/${p.a}</span>
        <span class="gold">${fmtGold(p.gold)}</span>
        <span class="mix">${Math.round(p.mix)}</span>
      </div>`
      )
      .join("");
  }

  function loadSnapshot() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function killProximityHtml(killProximity, info) {
    const si = info?.summoner_info || {};
    const myName = (si.name || "").toLowerCase();
    const myChamp = (si.champion || "").toLowerCase();
    let ranking = killProximity?.ranking || [];
    ranking = ranking.filter((p) => {
      const sameName = myName && (p.name || "").toLowerCase().includes(myName);
      const sameChamp = myChamp && (p.champion || "").toLowerCase() === myChamp;
      return !(sameName && sameChamp);
    });
    if (!ranking.length) {
      return `<section class="pm-duo">
        <h2>Duo kills</h2>
        <div class="pm-empty">Pas assez de kills en duo avec un mate pour ce match.</div>
      </section>`;
    }
    const rows = ranking
      .map(
        (p, i) => `<div class="pm-duo-row${i === 0 ? " top" : ""}">
        <span class="name">${p.champion}<span class="sub"> · ${p.name}</span></span>
        <span title="Tes kills où il/elle a assisté">${p.myKillsTheyAssisted}</span>
        <span title="Ses kills où tu as assisté">${p.theirKillsIAssisted}</span>
        <span class="total">${p.together}</span>
      </div>`
      )
      .join("");
    const top = ranking[0];
    const topLabel = top ? `${top.name} (${top.champion}) — ${top.together} kills ensemble` : "";
    return `<section class="pm-duo">
      <h2>Duo kills${topLabel ? `<span class="sub"> · ${topLabel}</span>` : ""}</h2>
      <div class="pm-duo-cols"><span>Allié</span><span>Tes kills + aide</span><span>Ses kills + toi</span><span>Total</span></div>
      ${rows}
    </section>`;
  }

  function render(snapshot) {
    const root = document.getElementById("postmortem-root");
    if (!snapshot?.economy?.players?.length) {
      root.innerHTML = `<div class="pm-empty-state">
        <p>Aucun post-mortem disponible.</p>
        <p class="sub">Termine une game sur TickDash pour générer le rapport.</p>
        <a class="pm-back" href="/">Retour au live</a>
      </div>`;
      return;
    }

    const { result, economy, info, gameSec, sessionId, killProximity } = snapshot;
    const powerScalars = snapshot.powerScalars || { sessionId, samples: [] };
    root.dataset.powerScalars = JSON.stringify(powerScalars);
    const si = info.summoner_info || {};
    const gd = goldDelta(economy, info);
    const lobby = scoreLobbyMix(economy.players);
    const mePlayer = economy.players.find((p) => isLocalPlayer(p, info));
    const powerRow =
      mePlayer && lobby?.scored?.find((s) => normChamp(s.champion) === normChamp(mePlayer.champion));
    const power = powerRow ? Math.round(powerRow.mix) : myPowerIndex(economy, info);
    const powerTotals = lobby?.totals || { ORDER: 0, CHAOS: 0 };
    const bluePower = powerTotals.ORDER;
    const redPower = powerTotals.CHAOS;
    const k = info.kill?.kills ?? "—";
    const d = info.death?.deaths ?? "—";
    const a = info.assist?.assists ?? "—";
    const title = result === "victory" ? "Victoire" : "Défaite";
    const gdVal = fmtGoldDeltaNav(gd);
    const gdClass = gd?.kind || "";
    const blueTotal = fmtGold(economy.teamGold?.ORDER || 0);
    const redTotal = fmtGold(economy.teamGold?.CHAOS || 0);
    const myTeam = resolveMyTeam(economy.players, info);
    const teamPowerHtml = teamPowerVsHtml(powerTotals, myTeam);
    const powerDelta = teamPowerDelta(powerTotals, myTeam);
    const pdVal = fmtPowerDelta(powerDelta);
    const pdClass = powerDeltaClass(powerDelta);

    root.innerHTML = `<article class="pm-card">
      <div class="pm-head ${result}">
        <div class="pm-title">${title}</div>
        <div class="pm-sub">${si.name || "Toi"} · ${si.champion || "—"} · ${fmtGameTime(gameSec)}</div>
        ${sessionId ? `<div class="pm-session">${sessionId}</div>` : ""}
      </div>
      <div class="pm-stats">
        <div class="pm-stat"><div class="lbl">KDA</div><div class="val">${k}/${d}/${a}</div></div>
        <div class="pm-stat"><div class="lbl">Puissance</div><div class="val power">${power ?? "—"}</div></div>
        <div class="pm-stat"><div class="lbl">${gd?.label?.replace("Gold ", "") || "Gold"}</div><div class="val ${gdClass}">${gdVal}</div></div>
        <div class="pm-stat"><div class="lbl">Δ Puiss. équipes</div><div class="val ${pdClass}">${pdVal}</div></div>
        <div class="pm-stat"><div class="lbl">Puiss. équipes</div><div class="val power-team">${teamPowerHtml}</div></div>
        <div class="pm-stat"><div class="lbl">Or équipes</div><div class="val sub">${blueTotal} / ${redTotal}</div></div>
      </div>
      <div class="pm-teams">
        <section class="pm-team">
          <h2>Blue · ${blueTotal}${teamPowerLabel(bluePower, myTeam === "ORDER")}</h2>
          <div class="pm-cols"><span>Champ</span><span>KDA</span><span>Or</span><span>Mix</span></div>
          ${teamRowsHtml(lobby?.scored, "ORDER", info)}
        </section>
        <section class="pm-team">
          <h2>Red · ${redTotal}${teamPowerLabel(redPower, myTeam === "CHAOS")}</h2>
          <div class="pm-cols"><span>Champ</span><span>KDA</span><span>Or</span><span>Mix</span></div>
          ${teamRowsHtml(lobby?.scored, "CHAOS", info)}
        </section>
      </div>
      ${killProximityHtml(killProximity, info)}
    </article>`;
  }

  render(loadSnapshot());
})();
