---
id: W-0060
title: "CI rot: works Selbsttest, Schritt Selbsttest mit Browser"
type: bug
priority: P2
status: in-arbeit
effort:
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: fix/w-0060-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest mit Browser

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 630a158 in MecryTv/mycron.

Rote Jobs:
- Board im Browser (Schritt Selbsttest mit Browser): https://github.com/MecryTv/mycron/actions/runs/45647265246/job/139321499749

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Ein Prozess schreibt eine größere JSON-Datei mit writeJson, ein anderer liest sie gleichzeitig.
2. Der Leser bekommt einen Teil der Datei, JSON.parse scheitert mit „Unexpected end of JSON input“. Häufigkeit: selten im Alltag, im Selbsttest bei 83 von 174 Lesevorgängen.

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Dialog Discord-Bot im Browser mit Reitern, Vorschau, Kanalwahl und Einrichtung (W-0038): Unexpected end of JSON input
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
writeJson in lib.mjs schrieb direkt in die Zieldatei (fs.writeFileSync kürzt die Datei und schreibt sie in Stücken). Der Browser-Schritt W-0038 liest ~/.works/discord/config.json, während das Board sie über die API schreibt; der Bot liest dieselbe Datei bei jedem Durchgang.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
writeJson schreibt in eine Zwischendatei neben dem Ziel und benennt sie dann um. Unter Windows bis zu 40 Versuche bei EPERM, EACCES oder EBUSY, dann Fehler und Zwischendatei weg. Alle JSON-Schreiber (Projekt-config, state, Discord-config usw.) laufen über writeJson; secret.json hat einen eigenen Schreibweg und bleibt. Regressionstest „Dateien: writeJson schreibt in einem Zug (W-0060)“.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ]

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Stand: 2026-11-25 16:57

Fix: writeJson atomar (Zwischendatei, umbenennen, Wiederholung bei Sperre unter Windows), Regressionstest mit schreibendem Kindprozess. Tests: mit Browser 60/60, ohne WebSocket 53/53, works-bot, ci-watch, mockups grün.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Übergabe aktualisiert
