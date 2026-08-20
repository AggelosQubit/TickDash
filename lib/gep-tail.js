"use strict";

const fs = require("fs");
const path = require("path");
const { GEP_LOG } = require("./paths");
const { mergeInfoUpdate, applyPush } = require("./gep-merge");
const { UltTracker } = require("./ult-tracker");

const INFO_RE = /\[GEP\] info update (\{.+})$/;
const EVENT_RE = /\[GEP\] New Event\s+(\{.+})$/;

class GepTail {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
    this.jsonlPath = path.join(sessionDir, "gep.jsonl");
    this.statePath = path.join(sessionDir, "gep-state.json");
    this.offset = 0;
    this.partial = "";
    this.reading = false;
    this.pendingRead = false;
    this.seen = new Set();
    this.watcher = null;
    this.debounce = null;
    this.state = { info: {}, eventCount: 0, lastEvent: null, killProximity: null };
    this.ultTracker = new UltTracker();
    this.ultSeen = new Set();
  }

  start() {
    if (!fs.existsSync(GEP_LOG)) {
      throw new Error(`GEP log introuvable: ${GEP_LOG}`);
    }
    this.offset = fs.statSync(GEP_LOG).size;
    this.watcher = fs.watch(GEP_LOG, () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.readNewBytes(), 50);
    });
    this.flushState();
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    clearTimeout(this.debounce);
    this.flushState();
  }

  remember(line) {
    if (this.seen.has(line)) return false;
    this.seen.add(line);
    if (this.seen.size > 5000) {
      this.seen.delete(this.seen.values().next().value);
    }
    return true;
  }

  append(record) {
    fs.appendFileSync(this.jsonlPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  flushState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  push(payload) {
    applyPush(this.state, payload);
    if (payload.type === "info") {
      this.append({
        type: "info",
        at: payload.at || new Date().toISOString(),
        feature: payload.feature,
        source: "ow",
        info: payload.info,
      });
    }
    this.flushState();
  }

  recordKillProximity(stats, records) {
    if (!stats) return;
    this.state.killProximity = stats;
    const at = new Date().toISOString();
    for (const rec of records || []) {
      this.append({ type: "kill_pair", at, ...rec });
    }
    this.flushState();
  }

  handleUltEvent(record) {
    const key = `${record.data?.frame}:${record.data?.champion}:${record.at?.slice(0, 19)}`;
    if (this.ultSeen.has(key)) return;
    this.ultSeen.add(key);
    if (this.ultSeen.size > 2000) {
      this.ultSeen.delete(this.ultSeen.values().next().value);
    }
    this.state.eventCount += 1;
    this.state.lastEvent = { name: record.name, at: record.at };
    this.append(record);
    this.flushState();
  }

  processUltFrames(at) {
    const ultEvents = this.ultTracker.detect(this.state.info, at);
    for (const ev of ultEvents) this.handleUltEvent(ev);
  }

  handleInfo(parsed) {
    const feature = parsed.featureName || parsed.feature;
    const key = parsed.key;
    let value = parsed.value;
    if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep */
      }
    }
    mergeInfoUpdate(this.state, feature, key, value);
    this.append({ type: "info", at: new Date().toISOString(), feature, key, value });
    if (feature === "team_frames" || feature === "tickdash" || feature === "teams") {
      this.processUltFrames(new Date().toISOString());
    }
    this.flushState();
  }

  handleEvent(parsed) {
    const record = {
      type: "event",
      at: new Date().toISOString(),
      feature: parsed.feature,
      name: parsed.key || parsed.feature,
      data: parsed.value,
    };
    this.state.eventCount += 1;
    this.state.lastEvent = { name: record.name, at: record.at };
    if (record.name === "match" || record.name === "matchStart") {
      this.state.matchStartAt = record.at;
    }
    this.append(record);
    this.flushState();
  }

  processLine(line) {
    if (!line.includes("[GEP]") || !this.remember(line)) return;

    const trimmed = line.trim();
    const infoMatch = trimmed.match(INFO_RE);
    if (infoMatch) {
      try {
        this.handleInfo(JSON.parse(infoMatch[1]));
      } catch {
        /* skip */
      }
      return;
    }

    const eventMatch = trimmed.match(EVENT_RE);
    if (eventMatch) {
      try {
        this.handleEvent(JSON.parse(eventMatch[1]));
      } catch {
        /* skip */
      }
    }
  }

  readNewBytes() {
    if (this.reading) {
      this.pendingRead = true;
      return;
    }
    this.reading = true;
    try {
      const cur = fs.statSync(GEP_LOG);
      if (cur.size < this.offset) {
        this.offset = 0;
        this.partial = "";
      }
      if (cur.size <= this.offset) return;

      const chunk = fs.readFileSync(GEP_LOG, {
        encoding: "utf8",
        start: this.offset,
        end: cur.size - 1,
      });
      this.offset = cur.size;
      this.partial += chunk;
      const lines = this.partial.split(/\r?\n/);
      this.partial = lines.pop() || "";
      for (const line of lines) this.processLine(line);
    } finally {
      this.reading = false;
      if (this.pendingRead) {
        this.pendingRead = false;
        this.readNewBytes();
      }
    }
  }
}

module.exports = { GepTail };
