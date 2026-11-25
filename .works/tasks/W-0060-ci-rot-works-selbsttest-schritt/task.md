---
id: W-0060
title: "CI rot: works Selbsttest, Schritt Selbsttest mit Browser"
type: bug
priority: P2
status: backlog
effort:
risk:
created: 2026-11-25
updated: 2026-11-25
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
1. 

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
- 2026-11-25: Aufgabe angelegt
