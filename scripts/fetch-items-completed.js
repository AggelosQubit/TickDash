"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "items-completed.json");
const MIN_GOLD = 3000;
const SKIP_TAGS = new Set(["Consumable", "Trinket", "Vision"]);

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url} → HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

function isCompletedItem(it) {
  const total = Number(it?.gold?.total || 0);
  if (total < MIN_GOLD) return false;
  if (it?.gold?.purchasable === false) return false;
  const tags = it?.tags || [];
  if (tags.some((tag) => SKIP_TAGS.has(tag))) return false;
  if (/deprecated/i.test(it?.name || "")) return false;
  return true;
}

async function main() {
  const versions = await get("https://ddragon.leagueoflegends.com/api/versions.json");
  const patch = versions[0];
  const itemsJson = await get(
    `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`
  );

  const completed = {};
  const samples = [];

  for (const [id, it] of Object.entries(itemsJson.data || {})) {
    if (!isCompletedItem(it)) continue;
    completed[id] = true;
    if (samples.length < 8) {
      samples.push({ id, name: it.name, gold: it.gold.total });
    }
  }

  const payload = {
    patch,
    minGold: MIN_GOLD,
    generatedAt: new Date().toISOString(),
    count: Object.keys(completed).length,
    completed,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`[items-completed] patch ${patch} → ${payload.count} ids (≥${MIN_GOLD}g)`);
  for (const row of samples) {
    console.log(`  ${row.id} ${row.name} (${row.gold})`);
  }
  console.log(`→ ${OUT}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
