# TickDash GEP (Overwolf)

Mini app pour subscribe **damage** / **counters** et push vers TickDash.

## Load

1. Overwolf → Settings → Support → Developer options → **Load unpacked**
2. Dossier : `TickDash/ow-gep`
3. Lance une game + `npm start` dans TickDash

## Vérif

- F12 sur background OW (dev mode) → logs push
- Nav TickDash → pill **OW ✓** + **Dmg share** en %
- `gep-state.json` → clés `damage`, `tickdash.damage_share`

Le **%** vient du Live Client (`allgamedata`) car GEP n'expose pas de `damage_share` natif. GEP `damage` pousse quand même `total_damage_dealt_to_champions`.
