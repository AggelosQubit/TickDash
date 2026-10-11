"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../lib/paths");

const OLD_DESCRIPTION = "Node.js JavaScript Runtime";
const NEW_DESCRIPTION = "TickDash";

function patchedDescription() {
  const value = Buffer.alloc(OLD_DESCRIPTION.length * 2, 0);
  Buffer.from(NEW_DESCRIPTION, "utf16le").copy(value);
  return value;
}

function build() {
  const source = process.execPath;
  const dest = path.join(ROOT, "TickDash.exe");
  const oldBuf = Buffer.from(OLD_DESCRIPTION, "utf16le");
  const newBuf = patchedDescription();

  if (path.resolve(source) === path.resolve(dest)) {
    console.log(`[TickDash] build skipped — déjà lancé via ${dest}`);
    return dest;
  }

  let current = null;
  try {
    current = fs.readFileSync(dest);
  } catch {
    current = null;
  }
  if (current && current.includes(newBuf) && !current.includes(oldBuf)) {
    const srcTime = fs.statSync(source).mtimeMs;
    const destTime = fs.statSync(dest).mtimeMs;
    if (destTime >= srcTime) {
      console.log(`[TickDash] ${dest} déjà à jour`);
      return dest;
    }
  }

  const buf = fs.readFileSync(source);
  const at = buf.indexOf(oldBuf);
  if (at < 0) {
    throw new Error(`description "${OLD_DESCRIPTION}" introuvable dans ${source}`);
  }
  newBuf.copy(buf, at);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  console.log(`[TickDash] ${dest}`);
  return dest;
}

if (require.main === module) {
  build();
}

module.exports = { build };
