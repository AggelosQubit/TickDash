"use strict";

const fs = require("fs");
const path = require("path");
const { SESSIONS_DIR, PORT } = require("./lib/paths");
const { gameSlug, waitForGameStart, waitForGameEnd } = require("./lib/detect-game");
const { GepTail } = require("./lib/gep-tail");
const { createDaemonServer } = require("./lib/session-server");
const { LiveDmgPoller, clearLiveSnapshot } = require("./lib/live-dmg");

function tsFolder() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function log(msg) {
    console.log(`[TickDash] ${new Date().toISOString()} ${msg}`);
}

async function runSession(stats, daemon) {
    const slug = gameSlug(stats);
    const folderName = `${slug}-${tsFolder()}`;
    const sessionDir = path.join(SESSIONS_DIR, folderName);
    fs.mkdirSync(sessionDir, { recursive: true });

    const sessionMeta = {
        id: folderName,
        dir: sessionDir,
        game: slug,
        gameMode: stats.gameMode,
        mapName: stats.mapName,
        startedAt: new Date().toISOString(),
        endedAt: null,
        port: PORT,
    };

    fs.writeFileSync(path.join(sessionDir, "session.json"), JSON.stringify(sessionMeta, null, 2), "utf8");

    log(`Game détectée → ${slug}`);
    log(`Session     → ${sessionDir}`);
    log(`GEP tail    → gep.jsonl (Overwolf log)`);
    log(`HTTP        → http://127.0.0.1:${PORT}/`);

    clearLiveSnapshot();
    const tail = new GepTail(sessionDir);
    const liveDmg = new LiveDmgPoller(tail);

    daemon.attachSession(sessionMeta, tail);

    try {
        tail.start();
    } catch (err) {
        log(`WARN GEP tail: ${err.message} (Porofessor/Overwolf requis)`);
    }

    liveDmg.start();

    await waitForGameEnd();

    sessionMeta.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(sessionDir, "session.json"), JSON.stringify(sessionMeta, null, 2), "utf8");

    tail.stop();
    liveDmg.stop();
    daemon.detachSession();
    clearLiveSnapshot();

    log(`Session terminée → ${folderName}`);
}

async function main() {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const daemon = createDaemonServer(PORT);
    await daemon.start();

    log(`Daemon démarré — port ${PORT} (serveur persistant)`);
    log(`UI → http://127.0.0.1:${PORT}/`);

    for (; ;) {
        log("En attente d'une game (Live Client :2999)...");
        const stats = await waitForGameStart();
        await runSession(stats, daemon);
        log("En attente de la prochaine game...");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
