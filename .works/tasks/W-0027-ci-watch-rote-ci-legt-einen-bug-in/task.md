---
id: W-0027
title: "ci-watch: rote CI legt einen Bug in works an"
type: feature
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
tags: [ci, github]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# ci-watch: rote CI legt einen Bug in works an

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (alles einbauen, P3). Ist die CI für einen Commit rot, legt ci-watch in einem Projekt mit .works gleich einen Bug an: fehlgeschlagener Job und Schritt, Ausschnitt aus dem Log, Commit und Link zum Lauf. Heute steht das Rot nur in der Ausgabe des Wächters. Kein doppelter Bug für denselben Commit oder denselben fehlgeschlagenen Schritt; ist ein passender Bug noch offen, dort einen Verlaufseintrag ergänzen. Ohne .works oder ohne Zugriff auf die Logs (Rate-Limit ohne Token) nur melden.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Ist die CI eines Commits rot und hat das Projekt .works, legt ci-watch einen Bug mit Job, Schritt, Log-Ausschnitt, Commit und Link zum Lauf an
- [ ] Für denselben Commit und Schritt entsteht kein zweiter Bug; ist ein passender Bug offen, bekommt er einen Verlaufseintrag
- [ ] Ohne .works oder ohne Zugriff auf die Logs meldet ci-watch nur, wie bisher
- [ ] Test deckt rote CI, doppelte Meldung und fehlendes .works ab

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
- 2026-11-22: Aufgabe angelegt
