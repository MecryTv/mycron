---
id: W-0045
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: erledigt
effort:
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed: 2026-11-24
milestone:
branch: fix/w-0045-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->
Der Selbsttest-Schritt zu W-0044 erwartet Auswahlmenü und Knöpfe am Dashboard auch unter Node 18 und 20, wo der Bot ohne Gateway sie bewusst weglässt; die CI ist dort rot, Node 22 ist grün.

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 0e0e24a in MecryTv/mycron.

Rote Jobs:
- Node 18 auf windows-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496214778
- Node 20 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496214900
- Node 20 auf windows-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496214953
- Node 18 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496214964
- Node 20 auf ubuntu-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496215006
- Node 18 auf ubuntu-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45408677281/job/138496215102

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Node ohne globales WebSocket: `NODE_OPTIONS=--no-experimental-websocket` (entspricht Node 18 und 20).
2. `works selftest --only Discord`
3. Schritt „Dashboard nach D3 …“ scheitert mit „Auswahlmenü fehlt: []“. Immer.

## Erwartetes Verhalten
Ohne Gateway hat das Dashboard keine Knöpfe (Klicks kämen nicht an), Bild, Zeilen und Aufräumen gehen trotzdem; der Test prüft genau das.

## Tatsächliches Verhalten
Der Test verlangt Menü und Knöpfe unabhängig vom Gateway.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->
CI: Node 18 und 20 auf Ubuntu, macOS und Windows; Commit 0e0e24a (Merge von W-0044).

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Dashboard nach D3 mit Bild und Knöpfen, Status des Bots, der Kanal räumt sich auf (W-0044): Auswahlmenü fehlt: []
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Im Selbsttest-Schritt zu W-0044 standen die Prüfungen von Auswahlmenü und Knöpfen vor der Weiche `if (hasWs)`. Der Bot rendert Knöpfe nur mit `interactive` (Gateway oder gemeinsamer Bot) und lässt sie unter Node 18 und 20 weg. Lokal lief nur Node 24, deshalb fiel es erst in der CI auf.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
Prüfungen von Menü und Knöpfen in den Zweig mit Gateway verschoben; ohne Gateway prüft der Test, dass das Dashboard keine Knöpfe hat. Vor dem Abschluss die Discord-Schritte zusätzlich mit `NODE_OPTIONS=--no-experimental-websocket` laufen lassen.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Discord-Schritte des Selbsttests grün mit und ohne globales WebSocket (wie Node 22 und Node 18/20 in der CI)

## Betroffene Dateien
- plugins/works/skills/works/scripts/selftest.mjs: Schritt zu W-0044

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-24. Keine offene Übergabe.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Gestartet (Status: backlog → in-arbeit)
- 2026-11-24: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Discord-Schritte des Selbsttests grün mit und ohne globales WebSocket (wie Node 22 und Node 18/20 in der CI)" abgehakt
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
