"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ROOT, PORT } = require("./paths");

const EXE = path.join(ROOT, "bin", "TickDashWebView.exe");

function openDashboard(log) {
  const write = log || (() => {});
  if (!fs.existsSync(EXE)) {
    write("WebView2 absent — node scripts/build-webview.js");
    return false;
  }
  const url = `http://127.0.0.1:${PORT}/`;
  const child = spawn(EXE, [url], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  write(`WebView2 → ${url}`);
  return true;
}

module.exports = { openDashboard, EXE };
