"use strict";

const http = require("http");

const payload = {
  type: "info",
  at: new Date().toISOString(),
  feature: "damage",
  info: {
    damage: {
      total_damage_dealt_to_champions: "125000",
    },
  },
};

const body = JSON.stringify(payload);
const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 3789,
    path: "/gep/push",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => {
      data += c;
    });
    res.on("end", () => {
      console.log(res.statusCode, data);
      if (res.statusCode === 200) {
        console.log("OK — F5 sur http://127.0.0.1:3789/ → Dmg share devrait afficher 125k");
      } else if (res.statusCode === 503) {
        console.log("Pas de session active — lance une game + npm start d'abord");
      }
    });
  }
);

req.on("error", (err) => {
  console.error("Erreur:", err.message, "— npm start lancé ?");
});
req.write(body);
req.end();
