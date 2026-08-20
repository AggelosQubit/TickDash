"use strict";

function asItemArray(items) {
  if (items == null) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "object") return Object.values(items).filter((x) => x && typeof x === "object");
  return [];
}

/** Somme LC `price` × count — même formule pour tous les joueurs. */
function itemGold(items) {
  return asItemArray(items).reduce(
    (sum, it) => sum + Number(it?.price || 0) * Number(it?.count || 1),
    0
  );
}

module.exports = { asItemArray, itemGold };
