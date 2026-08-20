"use strict";

const { asItemArray } = require("./item-gold");

function mapLcItems(items) {
  return asItemArray(items)
    .map((it) => ({
      itemID: Number(it?.itemID || 0),
      displayName: it?.displayName || null,
      slot: Number(it?.slot ?? -1),
    }))
    .filter((it) => it.itemID > 0);
}

function countCompletedItems(items, completedSet) {
  if (!completedSet?.size) return 0;
  let n = 0;
  for (const it of mapLcItems(items)) {
    if (completedSet.has(String(it.itemID))) n += 1;
  }
  return n;
}

module.exports = { mapLcItems, countCompletedItems };
