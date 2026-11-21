---
id: W-0014
title: "Werkzeuge: Prüfungs-Gesundheit über alle Aufgaben"
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
tags: [ui, board, checks]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Werkzeuge: Prüfungs-Gesundheit über alle Aufgaben

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 5 vom 2026-11-21, vom Nutzer gewünscht. Eine Übersicht unter Werkzeuge mit den Prüfungen des Projekts über alle Aufgaben: langsamste (Median der Laufzeit), wackeligste (Wechsel bei gleichem Codestand, wie W-0009), am häufigsten rot. Gerade bei RL Nexus mit 51 Prüfungen sieht man so, welche man reparieren oder beschleunigen sollte. Daten aus den checks.json der Aufgaben (hist aus W-0009). Erst Entwurf zeigen, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Werkzeuge zeigen je Prüfung Laufzeit, Fehlerquote und wackelig über alle Aufgaben
- [ ] Sortierbar nach langsam, rot, wackelig
- [ ] Funktioniert auch mit 51 Prüfungen übersichtlich

## Umsetzungsplan
- [ ] Entwurf zeigen, Wahl abwarten
- [ ] Auswertung über alle checks.json (API)
- [ ] Anzeige unter Werkzeuge
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
