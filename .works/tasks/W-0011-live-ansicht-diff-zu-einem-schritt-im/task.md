---
id: W-0011
title: "Live-Ansicht: Diff zu einem Schritt im Verlauf"
type: feature
priority: P3
status: backlog
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [ui, board]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live-Ansicht: Diff zu einem Schritt im Verlauf

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 1 vom 2026-11-21, vom Nutzer gewünscht. Im Verlauf der Live-Ansicht steht heute nur "Bearbeitet src/levels.ts". Ein Klick auf so einen Eintrag soll die Änderung an dieser Datei zeigen (Diff gegen HEAD bzw. den Stand im Worktree der Aufgabe), damit man nebenbei sieht, was Claude ändert und nicht nur wo. Der Reiter Code und Commits im Detailpanel kann schon Diffs je Datei zeigen, das wiederverwenden. Nur lokal, nicht im Leselink. Erst Entwurf zeigen, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Ein Klick auf einen Dateieintrag im Verlauf zeigt den Diff dieser Datei
- [ ] Bei Aufgaben im Worktree kommt der Diff aus dem Worktree
- [ ] Im Leselink ist der Eintrag nicht klickbar
- [ ] Große Diffs werden gekürzt, die Seite bleibt bedienbar

## Umsetzungsplan
- [ ] Entwurf zeigen, Wahl abwarten
- [ ] API für Diff einer Datei je Aufgabe (vorhandenen Code nutzen)
- [ ] Verlauf klickbar machen, Anzeige im Board
- [ ] Selbsttest mit Browser, Linux, Doku

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
- 2026-11-21: Brainstorming angehängt
- 2026-11-21: Entwurf A „Board-Erweiterungen W-0011 bis W-0014“ angehängt
