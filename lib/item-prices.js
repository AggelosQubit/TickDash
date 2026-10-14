"use strict";

const https = require("https");
const { asItemArray } = require("./item-gold");

const SKIP_TAGS = new Set(["Consumable", "Trinket", "Vision"]);

let prices = new Map();
let names = new Map();
let patch = "";
let loading = null;
let csReady = false;
const inventories = new Map();

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "TickDash", Accept: "application/json" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        getJson(res.headers.location).then(resolve, reject);
        return;
      }
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200 || !body) {
          reject(new Error(`HTTP ${res.statusCode || "?"}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function bootDepth(id, items, memo) {
  if (memo.has(id)) return memo.get(id);
  const it = items.get(id);
  const tags = it?.tags || [];
  if (!it || !tags.includes("Boots")) {
    memo.set(id, 0);
    return 0;
  }
  memo.set(id, 1);
  const from = Array.isArray(it.from) ? it.from.map(String) : [];
  let parent = 0;
  for (const componentId of from) parent = Math.max(parent, bootDepth(componentId, items, memo));
  const depth = parent > 0 ? parent + 1 : 1;
  memo.set(id, depth);
  return depth;
}

function tier2BootId(id, items, depthOf) {
  let current = String(id);
  const guard = new Set();
  while (depthOf(current) > 2 && !guard.has(current)) {
    guard.add(current);
    const from = Array.isArray(items.get(current)?.from) ? items.get(current).from.map(String) : [];
    const parent = from.find((componentId) => depthOf(componentId) > 0);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function buildPriceMap(itemJson) {
  const data = itemJson?.data || {};
  const items = new Map(Object.entries(data));
  const memo = new Map();
  const depthOf = (id) => bootDepth(String(id), items, memo);
  const nextPrices = new Map();
  const nextNames = new Map();

  for (const [id, it] of items) {
    const tags = it?.tags || [];
    if (tags.some((tag) => SKIP_TAGS.has(tag))) continue;
    const total = Number(it?.gold?.total || 0);
    const depth = depthOf(id);
    let price = total;
    if (depth >= 3) {
      const tier2 = tier2BootId(id, items, depthOf);
      price = Number(items.get(tier2)?.gold?.total || 0);
    }
    if (price <= 0) continue;
    nextPrices.set(Number(id), price);
    nextNames.set(Number(id), it.name || id);
  }

  return { prices: nextPrices, names: nextNames };
}

async function refreshItemPrices(log) {
  const write = log || (() => {});
  loading = (async () => {
    const versions = await getJson("https://ddragon.leagueoflegends.com/api/versions.json");
    const version = Array.isArray(versions) && versions[0] ? versions[0] : "";
    if (!version) throw new Error("patch inconnu");
    const itemJson = await getJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`);
    const built = buildPriceMap(itemJson);
    prices = built.prices;
    names = built.names;
    patch = version;
    write(`Prix objets ${version} → ${prices.size} ids`);
    return prices.size;
  })().catch((err) => {
    write(`Prix objets FAIL: ${err.message}`);
    throw err;
  });
  return loading;
}

function ensureItemPrices(log) {
  if (prices.size) return Promise.resolve(prices.size);
  if (loading) return loading.catch(() => refreshItemPrices(log));
  return refreshItemPrices(log).catch(() => 0);
}

function noteItemPrices(phase, log) {
  if (phase === "ChampSelect") {
    if (csReady) return loading || Promise.resolve(prices.size);
    csReady = true;
    inventories.clear();
    return refreshItemPrices(log).catch(() => 0);
  }
  if (phase === "None" || phase === "Lobby" || phase === "Matchmaking" || phase === "ReadyCheck") {
    csReady = false;
  }
  return Promise.resolve(prices.size);
}

function itemCounts(items) {
  const counts = new Map();
  for (const it of asItemArray(items)) {
    const id = Number(it?.itemID || it?.id || 0);
    if (!id) continue;
    const count = Math.max(1, Number(it?.count || 1));
    counts.set(id, (counts.get(id) || 0) + count);
  }
  return counts;
}

function signatureOf(counts) {
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => `${id}x${count}`)
    .join(",");
}

function diffCounts(prev, next) {
  const added = [];
  const removed = [];
  const ids = new Set([...(prev ? prev.keys() : []), ...next.keys()]);
  for (const id of ids) {
    const delta = (next.get(id) || 0) - (prev?.get(id) || 0);
    if (delta > 0) added.push({ id, count: delta });
    if (delta < 0) removed.push({ id, count: -delta });
  }
  return { added, removed };
}

function goldOf(counts) {
  let gold = 0;
  for (const [id, count] of counts) {
    const price = prices.get(id);
    if (!price) continue;
    gold += price * count;
  }
  return gold;
}

function itemLabel(id) {
  return names.get(id) || String(id);
}

function checkInventory(playerKey, items) {
  const counts = itemCounts(items);
  const signature = signatureOf(counts);
  const prev = inventories.get(playerKey);
  const gold = goldOf(counts);
  if (!prev) {
    inventories.set(playerKey, { signature, counts });
    return { gold, changed: false, added: [], removed: [] };
  }
  if (prev.signature === signature) {
    return { gold, changed: false, added: [], removed: [] };
  }
  const delta = diffCounts(prev.counts, counts);
  inventories.set(playerKey, { signature, counts });
  return { gold, changed: true, ...delta };
}

function formatDelta(delta) {
  const parts = [];
  for (const row of delta.added || []) {
    if (!prices.has(row.id)) continue;
    parts.push(`+${itemLabel(row.id)} ${prices.get(row.id)}`);
  }
  for (const row of delta.removed || []) {
    if (!prices.has(row.id)) continue;
    parts.push(`−${itemLabel(row.id)}`);
  }
  return parts.join(", ");
}

function clearInventories() {
  inventories.clear();
}

function priceOf(itemId) {
  return prices.get(Number(itemId)) || 0;
}

module.exports = {
  noteItemPrices,
  ensureItemPrices,
  refreshItemPrices,
  checkInventory,
  formatDelta,
  clearInventories,
  priceOf,
  buildPriceMap,
};
