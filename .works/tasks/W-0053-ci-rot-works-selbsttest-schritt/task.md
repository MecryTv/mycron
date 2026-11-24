---
id: W-0053
title: "CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest"
type: bug
priority: P2
status: backlog
effort:
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 85ecc2a in MecryTv/mycron.

Rote Jobs:
- Board im Browser (Schritt Selbsttest mit Browser): https://github.com/MecryTv/mycron/actions/runs/45486887051/job/138774531223
- Node 22 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45486887051/job/138774531625

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. 

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Dialog Discord-Bot im Browser mit Reitern, Vorschau, Kanalwahl und Einrichtung (W-0038): Unexpected end of JSON input
Selbsttest: Board merkt sich seinen Port: Neustart ohne --port, belegter Port weicht aus: Belegter letzter Port nicht ausgewichen: Live-Board läuft: http://127.0.0.1:48488/
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] 

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-24: Aufgabe angelegt
