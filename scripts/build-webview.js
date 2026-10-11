"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");
const { ROOT } = require("../lib/paths");

const VERSION = "1.0.2792.45";
const BIN = path.join(ROOT, "bin");
const SDK = path.join(BIN, "webview2-sdk");
const ZIP = path.join(SDK, "Microsoft.Web.WebView2.zip");
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const EXE = path.join(BIN, "TickDashWebView.exe");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error("téléchargement WebView2 " + res.statusCode));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", reject);
  });
}

function findDll(start, name) {
  const entries = fs.readdirSync(start, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(start, entry.name);
    if (entry.isDirectory()) {
      const found = findDll(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(SDK, { recursive: true });
  const coreHint = findDll(SDK, "Microsoft.Web.WebView2.Core.dll");
  if (!coreHint) {
    const url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/" + VERSION;
    await download(url, ZIP);
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${ZIP}' -DestinationPath '${SDK}'`],
      { stdio: "inherit" }
    );
  }

  const core = findDll(SDK, "Microsoft.Web.WebView2.Core.dll");
  const winforms = findDll(SDK, "Microsoft.Web.WebView2.WinForms.dll");
  const loader = findDll(path.join(SDK, "runtimes", "win-x64"), "WebView2Loader.dll");
  if (!core || !winforms || !loader) {
    throw new Error("assemblies WebView2 introuvables dans le package");
  }

  fs.mkdirSync(BIN, { recursive: true });
  execFileSync(
    CSC,
    [
      "/nologo",
      "/target:winexe",
      "/platform:x64",
      "/utf8output",
      "/out:" + EXE,
      "/r:System.Windows.Forms.dll",
      "/r:System.Drawing.dll",
      "/r:" + core,
      "/r:" + winforms,
      path.join(ROOT, "scripts", "tickdash-webview.cs"),
    ],
    { stdio: "inherit" }
  );
  fs.copyFileSync(core, path.join(BIN, "Microsoft.Web.WebView2.Core.dll"));
  fs.copyFileSync(winforms, path.join(BIN, "Microsoft.Web.WebView2.WinForms.dll"));
  fs.copyFileSync(loader, path.join(BIN, "WebView2Loader.dll"));
  console.log(EXE);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
