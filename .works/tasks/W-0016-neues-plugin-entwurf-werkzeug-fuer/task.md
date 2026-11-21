---
id: W-0016
title: "Neues Plugin: Entwurf-Werkzeug für Gestaltungsaufgaben"
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
tags: [skill, plugin, entwurf]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Neues Plugin: Entwurf-Werkzeug für Gestaltungsaufgaben

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Neuer Skill 2 vom 2026-11-21, vom Nutzer gewünscht, als eigenes Plugin im Marketplace mycron. Bei jeder Gestaltungsaufgabe lief derselbe Ablauf von Hand: Entwurfsseite mit den echten Styles des Projekts (bei works das Board-CSS per file://), Umschalt-Rahmen für Varianten und hell/dunkel, Screenshots in drei Breiten (1440, 768, 390) mit installiertem Chrome über Playwright, Prüfung auf seitliches Scrollen und Fehler, works design add/brainstorm, im Standardbrowser öffnen. Das Plugin soll diesen Ablauf als Skill mit kleinen Hilfsskripten bereitstellen. Bekannte Fallen: Klassennamen aus dem Projekt-CSS können kollidieren (etwa .panel), Regexe in Template-Strings doppelt escapen.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Ein Skill führt durch Entwurf, Varianten-Rahmen, Screenshots in drei Breiten und das Anhängen an die Aufgabe
- [ ] Ein Hilfsskript macht Screenshots mit installiertem Chrome und meldet seitliches Scrollen und Seitenfehler
- [ ] Funktioniert mit und ohne works (ohne works nur Dateien und Screenshots)
- [ ] Das Plugin steht im Marketplace mycron

## Umsetzungsplan
- [ ] Ablauf und Auslöser festlegen
- [ ] Plugin-Gerüst, Vorlage für die Entwurfsseite
- [ ] Screenshot-Skript
- [ ] Test an einer echten Gestaltungsaufgabe, Doku

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
- 2026-11-21: tags: [skill, plugin, design] → [skill, plugin, entwurf]
