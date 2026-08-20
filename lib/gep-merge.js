"use strict";

function parseInfoValue(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function mergeInfoUpdate(state, feature, key, value) {
  if (!state.info[feature]) state.info[feature] = {};
  state.info[feature][key] = parseInfoValue(value);
}

function flattenInfo(infoObj) {
  const flat = {};
  for (const [key, value] of Object.entries(infoObj || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        flat[nestedKey] = nestedValue;
      }
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

function applyPush(state, payload) {
  if (payload.type === "info") {
    if (payload.info && typeof payload.info === "object") {
      const flat = flattenInfo(payload.info);
      for (const [key, value] of Object.entries(flat)) {
        mergeInfoUpdate(state, payload.feature, key, value);
      }
    } else if (payload.key != null) {
      mergeInfoUpdate(state, payload.feature, payload.key, payload.value);
    }
    return;
  }

  if (payload.type === "event") {
    state.eventCount = (state.eventCount || 0) + 1;
    state.lastEvent = { name: payload.name, at: payload.at };
    if (payload.name === "match" || payload.name === "matchStart") {
      state.matchStartAt = payload.at;
    }
  }

  if (payload.type === "ow-status") {
    state.ow = payload.state || {};
  }
}

module.exports = { mergeInfoUpdate, applyPush, parseInfoValue, flattenInfo };
