---
id: W-0049
title: "Hub als Einstieg: zweites Board startet nicht selbst, Port erst beim Klick im Hub"
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: [board, hub]
blocked_by: [W-0041]
blocks: []
related: []
source: manuell
incomplete: false
---

# Hub als Einstieg: zweites Board startet nicht selbst, Port erst beim Klick im Hub

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24, Verhalten von ihm bestätigt (Skizze: Projekt A läuft auf :4747; works board in Projekt B startet keinen Server für B, der Tab zeigt den Hub :4747/hub; im Hub A läuft [Öffnen], B gestoppt [Öffnen startet B auf :4748], C gestoppt [Öffnen]). Läuft schon ein Board und wird eines für ein anderes Projekt gestartet (works board --serve, Sitzungsstart, works start), startet works für dieses Projekt keinen zweiten Server und öffnet keinen neuen Tab, sondern zeigt den Hub des laufenden Boards. Der Hub zeigt alle bekannten Projekte, laufende und gestoppte. Ein Klick auf ein gestopptes Projekt startet dessen Board auf einem freien Port und öffnet es; ein laufendes öffnet sich direkt. Wartet auf W-0041, weil das Hub, Board und Server-Code gerade umschreibt.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Zweites Board startet keinen eigenen Server, der Tab zeigt den Hub
- [ ] Der Hub zeigt laufende und gestoppte Projekte; Öffnen startet ein gestopptes Board auf einem freien Port und öffnet es
- [ ] Ein laufendes Board öffnet sich aus dem Hub direkt, ohne zweiten Server
- [ ] Sitzungsstart, works start und works board --serve verhalten sich gleich; Claude bekommt die Adresse des Hubs genannt
- [ ] Selbsttest deckt beide Fälle ab, in beiden Sprachen (nach W-0041)

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] 

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Beziehung: blocked-by W-0041
