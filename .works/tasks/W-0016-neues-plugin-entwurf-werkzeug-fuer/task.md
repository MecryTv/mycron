---
id: W-0016
title: "Neues Plugin: Entwurf-Werkzeug für Gestaltungsaufgaben"
type: feature
priority: P3
status: erledigt
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed: 2026-11-21
milestone:
branch: feature/w-0016-neues-plugin-entwurf-werkzeug
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
- [x] Ein Skill führt durch Entwurf, Varianten-Rahmen, Screenshots in drei Breiten und das Anhängen an die Aufgabe
- [x] Ein Hilfsskript macht Screenshots mit installiertem Chrome und meldet seitliches Scrollen und Seitenfehler
- [x] Funktioniert mit und ohne works (ohne works nur Dateien und Screenshots)
- [x] Das Plugin steht im Marketplace mycron

## Umsetzungsplan
- [x] Ablauf und Auslöser festlegen
- [x] Plugin-Gerüst, Vorlage für die Entwurfsseite
- [x] Screenshot-Skript
- [x] Test an einer echten Gestaltungsaufgabe, Doku

## Betroffene Dateien
- `plugins/entwurf/skills/entwurf/scripts/entwurf.mjs`: shots (Screenshots, Prüfung) und inline (Einbetten)
- `plugins/entwurf/skills/entwurf/scripts/test.mjs`: Test für beide Teile
- `plugins/entwurf/skills/entwurf/vorlage.html`: Entwurfsseite mit Umschaltrahmen
- `plugins/entwurf/skills/entwurf/SKILL.md`: Ablauf und Fallen
- `plugins/entwurf/.claude-plugin/plugin.json`, `plugins/entwurf/README.md`
- `.claude-plugin/marketplace.json`, `README.md`: Eintrag im Marketplace
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Abgeschlossen am 2026-11-21. Keine offene Übergabe.

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
- 2026-11-21: tags: [skill, plugin, design] → [skill, plugin, entwurf]
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Plugin entwurf fertig: entwurf.mjs shots/inline, vorlage.html, SKILL.md. Test Windows mit Playwright und Linux (Docker, System-Chromium) grün. Skill per Agent ohne und mit Skill an W-0018 in einer Testkopie geprüft, eingebettete Entwürfe unter der Board-CSP im Browser geprüft. Fund: file://-CSS lädt im Board-iframe nicht, ältere Entwürfe erscheinen dort ungestylt.
- 2026-11-21: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
