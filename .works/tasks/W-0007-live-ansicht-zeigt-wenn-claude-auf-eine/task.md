---
id: W-0007
title: Live-Ansicht zeigt, wenn Claude auf eine Freigabe wartet
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [ui, board, hooks]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live-Ansicht zeigt, wenn Claude auf eine Freigabe wartet

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 3 vom 2026-11-21. Fragt Claude nach einer Erlaubnis für ein Werkzeug, zeigt die Live-Ansicht heute 'Gerade jetzt: Befehl ...' mit laufender Zeit, und 'Wartet auf dich' bleibt leer. Gewünscht: ein Hook (Notification bzw. Rechteabfrage) meldet den Zustand, die Live-Ansicht zeigt 'Claude wartet auf deine Freigabe' mit Werkzeug und Wartezeit, 'Wartet auf dich' führt den Punkt, optional Browser-Benachrichtigung. Der Zustand endet, sobald der Aufruf weiterläuft, abgelehnt wird oder die Antwort endet.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Während einer Rechteabfrage zeigt die Live-Ansicht 'wartet auf deine Freigabe' statt 'Gerade jetzt'

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
