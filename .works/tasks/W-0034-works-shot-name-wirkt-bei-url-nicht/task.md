---
id: W-0034
title: works shot --name wirkt bei --url nicht
type: bug
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [shot]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# works shot --name wirkt bei --url nicht

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gefunden am 2026-11-22 (P3, vom Nutzer gewünscht). works shot --url=... --name=hub-vorher legt die Bilder trotzdem unter einem aus der URL abgeleiteten Namen ab (etwa 127-0-0-1-4741-light-1440.png). Erwartet: --name bestimmt den Dateinamen auch bei --url.

## Reproduktion
1. works shot --url=http://127.0.0.1:4741/ --name=hub-vorher --widths=1440 --themes=light --out=<ordner>
2. Im Ordner liegt 127-0-0-1-4741-light-1440.png statt hub-vorher-light-1440.png. Immer.

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] works shot --url=… --name=x legt x-<schema>-<breite>.png ab

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
