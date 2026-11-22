---
id: W-0031
title: Board merkt sich seinen Port
type: feature
priority: P2
status: in-arbeit
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch: feature/w-0031-board-merkt-sich-seinen-port
tags: [board, hub]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Board merkt sich seinen Port

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (P2). Startet ein Board ohne --port (über den Hub, nach works board --stop, über ship), nimmt es den ersten freien Port ab 4747 statt seines alten. Ein offener Tab des Projekts verbindet sich dann nicht wieder, und auf dem alten Port kann ein anderes Projekt landen (verwaiste Tabs, W-0029). Gewünscht: Jedes Projekt merkt sich seinen letzten Port (lokal, nicht im Git) und startet ohne --port wieder darauf, sofern er frei ist; ist er belegt, der nächste freie wie bisher. Ein ausdrückliches --port gilt weiter.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Startet ein Board ohne --port, nimmt es den zuletzt genutzten Port des Projekts, wenn er frei ist
- [x] Ist der letzte Port belegt, weicht es wie bisher auf den nächsten freien aus
- [x] Ein ausdrückliches --port gilt weiter und wird danach als letzter Port gemerkt
- [x] Der letzte Port liegt lokal in .works (nicht im Git) und gilt auch nach works board --stop und für den Start über den Hub
- [x] Selbsttest deckt Stopp und Neustart auf demselben Port und den belegten Fall ab

## Umsetzungsplan
- [x] Selbsttest: Start mit --port, Stopp, Start ohne --port auf demselben Port; belegter letzter Port weicht aus; server-last.json in .works/.gitignore
- [x] server-control.mjs: rememberPort, lastPort; serve.mjs merkt den Port beim Start; works.mjs nimmt ihn ohne --port
- [x] Doku board.md, cli.md

## Betroffene Dateien
- plugins/works/skills/works/scripts/server-control.mjs, serve.mjs, works.mjs
- plugins/works/skills/works/scripts/selftest.mjs
- plugins/works/skills/works/references/board.md, cli.md

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: Umgesetzt, Selbsttest 34/34 mit Browser
