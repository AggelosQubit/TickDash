"use strict";

const path = require("path");

const ROOT = path.join(__dirname, "..");
const SESSIONS_DIR = path.join(ROOT, "sessions");
const GEP_LOG = path.join(
  process.env.LOCALAPPDATA || "",
  "Overwolf",
  "Log",
  "Apps",
  "Overwolf General GameEvents Provider",
  "index.html.log"
);

const PORT = Number(process.env.TICKDASH_PORT) || 3789;

module.exports = { ROOT, SESSIONS_DIR, GEP_LOG, PORT };
