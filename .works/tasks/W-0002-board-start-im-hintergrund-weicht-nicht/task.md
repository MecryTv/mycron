---
id: W-0002
title: Board-Start im Hintergrund weicht nicht auf freien Port aus
type: bug
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-20
updated: 2026-11-20
due:
completed:
milestone:
branch:
tags: [board, server]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Board-Start im Hintergrund weicht nicht auf freien Port aus

## Zusammenfassung
Im Hintergrund gestartete Board-Server (`--detach`) brechen ab, statt auf einen freien Port auszuweichen, sobald ein anderes Projekt Port 4747 belegt; ein zweites Projekt bekommt so kein Live-Board.

## Beschreibung
works board --serve --detach bricht mit 'Port 4747 ist nicht verfügbar (EADDRINUSE)' ab, wenn auf 4747 schon das Board eines anderen Projekts läuft. Ohne --detach weicht der Server auf 4748 bis 4757 aus, im Hintergrund nicht. Ursache: startDetached (scripts/server-control.mjs:178) gibt dem Hintergrundprozess immer --port=<port> mit. Im Kindprozess ist flags.port dadurch gesetzt, also fixedPort true (scripts/works.mjs:948), und serveBoard versucht keinen weiteren Port (scripts/serve.mjs:396). Aufgefallen am 2026-11-20 in mycron, während RL Nexus auf 4747 lief; umgangen mit --port 4748. Ein Board, das schon für dieses Projekt lief (server.json), soll seinen Port weiter behalten.

## Reproduktion
Häufigkeit: immer.
1. In Projekt A `works board --serve --detach` ausführen (belegt 4747).
2. In Projekt B, das noch nie ein Board hatte, `works board --serve --detach` ausführen.

## Erwartetes Verhalten
Projekt B startet sein Board auf 4748 (oder dem nächsten freien Port bis 4757) und nennt die URL, wie es der Start im Vordergrund schon tut.

## Tatsächliches Verhalten
Der Start bricht ab mit „Board-Server startet nicht (PID …). Details in .works/server.log“.

## Umgebung
works aus Commit bff165b, Windows 10, Node aus dem Systempfad. Projekt A war RL Nexus, Projekt B mycron.

## Logs und Fehlermeldungen
```
Fehler: Port 4747 ist nicht verfügbar (EADDRINUSE). Anderen Port mit --port wählen.
```

## Ursache
`startDetached` (scripts/server-control.mjs:178) baut die Argumente immer mit `--port=${port}`. Der Hintergrundprozess sieht dadurch `flags.port`, setzt `fixedPort: true` (scripts/works.mjs:948), und `serveBoard` überspringt den Ausweichversuch bei `EADDRINUSE` (scripts/serve.mjs:396). Der Start im Vordergrund ist nicht betroffen, weil dort ohne `--port` und ohne `server.json` `fixedPort` false bleibt.

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] works board --serve --detach startet auf dem nächsten freien Port, wenn 4747 von einem anderen Projekt belegt ist, und nennt die URL
- [ ] Mit ausdrücklichem --port bleibt der Port fest und der Start bricht bei Belegung mit der bisherigen Meldung ab
- [ ] Ein Neustart (--restart) oder ein Update-Neustart behält den Port aus server.json
- [ ] Selbsttest prüft den Start im Hintergrund bei belegtem Port

## Betroffene Dateien
- plugins/works/skills/works/scripts/server-control.mjs: `startDetached`, Port nur fest übergeben, wenn er vorgegeben oder aus server.json übernommen ist
- plugins/works/skills/works/scripts/works.mjs: Board-Start (`fixedPort`)
- plugins/works/skills/works/scripts/selftest.mjs: Start im Hintergrund bei belegtem Port

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-20: Aufgabe angelegt
- 2026-11-20: Akzeptanzkriterien: "Mit ausdrücklichem --port bleibt der Port fest und der Start bricht bei Belegung mit der bisherigen Meldung ab" ergänzt
- 2026-11-20: Akzeptanzkriterien: "Ein Neustart (--restart) oder ein Update-Neustart behält den Port aus server.json" ergänzt
- 2026-11-20: Akzeptanzkriterien: "Selbsttest prüft den Start im Hintergrund bei belegtem Port" ergänzt
