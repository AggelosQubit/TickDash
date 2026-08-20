# TickDash

Daemon Node minimal pour LoL.

## Flow

1. `node daemon.js` tourne en permanence
2. Détecte une game via Live Client API (`127.0.0.1:2999/gamestats`)
3. Crée `sessions/{gameMode-map}-{timestamp}/`
4. Tail le log GEP Overwolf → `gep.jsonl` + `gep-state.json`
5. Serve HTTP local sur `:3789`
6. Quand la game se ferme → session archivée, retour en attente

## Prérequis

- LoL lancé (Practice Tool OK)
- Overwolf + une app qui subscribe GEP (ex. Porofessor)

## Endpoints (pendant une session)

| URL | Contenu |
|-----|---------|
| http://127.0.0.1:3789/ | **UI GEP live** |
| http://127.0.0.1:3789/gep | JSON agrégé |
| http://127.0.0.1:3789/gep/events | derniers events |
| http://127.0.0.1:3789/gep/stream | jsonl brut |
| http://127.0.0.1:3789/gep/push | POST — app Overwolf |

## App Overwolf (dmg share)

Load unpacked → `TickDash/ow-gep` (voir `ow-gep/README.md`).

Live Client `:2999` → plus tard côté daemon ; l'app OW l'utilise déjà pour calculer le **damage share %**.

## Lancer

```bash
cd TickDash
npm start          # relance auto quand le code change
npm run start:once # sans watch
```
