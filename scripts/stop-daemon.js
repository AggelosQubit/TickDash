"use strict";

const { execFileSync } = require("child_process");

function run(file, args) {
  try {
    execFileSync(file, args, { stdio: "ignore", windowsHide: true });
  } catch {
    /* déjà arrêté */
  }
}

run("powershell.exe", [
  "-NoProfile",
  "-Command",
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*daemon.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
]);
run("taskkill.exe", ["/F", "/IM", "TickDash.exe"]);
