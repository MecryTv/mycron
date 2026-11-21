---
id: W-0020
title: board --open öffnet nur, wenn noch kein Tab offen ist
type: feature
priority: P2
status: backlog
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [board, live]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# board --open öffnet nur, wenn noch kein Tab offen ist

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-21: Das Board soll selbst prüfen, ob es schon läuft und schon offen ist, damit sich nicht durch einen Fehler ein weiteres Fenster oder ein weiterer Tab öffnet. Heute: works board --serve --detach --open startet den Server oder meldet nur die URL, wenn er schon läuft, und öffnet dann nichts. Claude öffnet die URL danach von Hand (Start-Process), auch wenn das Board schon in einem Tab offen ist, so entstand am 2026-11-21 ein zweiter Tab. Ziel: Der Server weiß, ob gerade ein Board-Tab verbunden ist. --open öffnet den Browser nur, wenn kein Tab verbunden ist, sonst meldet es, dass das Board schon offen ist. Gilt für den Start eines neuen Servers und für einen laufenden.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Läuft der Server ohne offenen Board-Tab, öffnet --open den Browser
- [ ] Startet der Server neu, öffnet --open den Browser wie bisher
- [ ] Läuft der Server und ist ein Board-Tab offen, öffnet works board --serve --detach --open keinen neuen Tab und sagt das

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
- 2026-11-21: Aufgabe angelegt
