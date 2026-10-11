"use strict";

const { readChampSelect } = require("./lcu");
const { setClipboard, setReady } = require("./chat-clipboard");
const { TEAM_POWER_INTRO } = require("./team-power");
const { openDashboard } = require("./webview-window");
const { noteLobbyPhase } = require("./lobby-ranks");
const { noteChampionBuild } = require("./champion-build");

const POLL_MS = 1500;

class ChampSelectClipboard {
  constructor(log) {
    this.log = log || (() => {});
    this.timer = null;
    this.pending = Promise.resolve();
    this.copied = false;
    this.announced = false;
    this.skippedMode = "";
    this.guiOpened = false;
  }

  start() {
    this.log("Champion select — collage de l'explication dès que le CS commence");
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    this.pending = this.pending
      .catch(() => {})
      .then(() => this.poll());
  }

  async poll() {
    const state = await readChampSelect();
    if (!state.online) {
      this.announced = false;
      return;
    }
    if (!this.announced) {
      this.announced = true;
      this.log("Client League détecté");
    }
    await noteLobbyPhase(state.phase, this.log);
    noteChampionBuild(state.phase, this.log);
    if (state.phase !== "ChampSelect") {
      this.copied = false;
      this.skippedMode = "";
      this.guiOpened = false;
      return;
    }
    if (!this.guiOpened) {
      this.guiOpened = openDashboard(this.log);
    }
    if (!state.enabled) {
      if (this.skippedMode !== state.gameMode) {
        this.skippedMode = state.gameMode || "?";
        this.log(`Clipboard CS off (${this.skippedMode}) — ranked, normal et practice tool uniquement`);
      }
      return;
    }
    if (this.copied) return;
    this.copied = true;
    try {
      setReady(TEAM_POWER_INTRO);
      await setClipboard(TEAM_POWER_INTRO);
      this.log(`Clipboard CS → ${TEAM_POWER_INTRO}`);
    } catch (err) {
      this.copied = false;
      this.log(`Clipboard CS FAIL: ${err.message}`);
    }
  }
}

module.exports = { ChampSelectClipboard };
