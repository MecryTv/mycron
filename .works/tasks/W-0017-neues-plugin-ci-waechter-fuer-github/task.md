---
id: W-0017
title: "Neues Plugin: CI-Wächter für GitHub Actions"
type: feature
priority: P3
status: in-arbeit
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch: feature/w-0017-neues-plugin-ci-waechter-fuer
tags: [skill, plugin, ci]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Neues Plugin: CI-Wächter für GitHub Actions

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Neuer Skill 3 vom 2026-11-21, vom Nutzer gewünscht, als eigenes Plugin im Marketplace mycron. Nach einem Push wartet der Skill auf den GitHub-Actions-Lauf zum gepushten Commit und meldet grün oder rot, bei rot mit dem fehlgeschlagenen Job und der Fehlerstelle aus dem Log. Muss ohne gh funktionieren (beim Nutzer nicht installiert): öffentliche GitHub-API per curl für öffentliche Repos, gh oder ein Token nur, wenn vorhanden. Kein Polling in kurzen Abständen, Abfragen höchstens alle 30 Sekunden. Keine Zugangsdaten in URLs.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Nach einem Push meldet der Skill das Ergebnis des CI-Laufs zum Commit
- [x] Bei rot nennt er Job und Fehlerstelle
- [x] Funktioniert ohne gh bei öffentlichen Repos
- [x] Abfragen höchstens alle 30 Sekunden, mit Zeitlimit

## Umsetzungsplan
- [x] Ablauf und Auslöser festlegen
- [x] Plugin-Gerüst und Abfrageskript
- [x] Fehlerstelle aus Job-Logs
- [x] Test am Repo mycron, Doku

## Betroffene Dateien
- `plugins/ci-waechter/skills/ci-waechter/scripts/ci-status.mjs`: Abfrage, Warten, Fehlerstellen, Exit-Codes
- `plugins/ci-waechter/skills/ci-waechter/scripts/test.mjs`: Test der Hilfsfunktionen
- `plugins/ci-waechter/skills/ci-waechter/SKILL.md`: Ablauf und Aufbau der Meldung
- `plugins/ci-waechter/.claude-plugin/plugin.json`, `plugins/ci-waechter/README.md`
- `.claude-plugin/marketplace.json`, `README.md`: Eintrag im Marketplace

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
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Skript ci-status.mjs fertig, live geprüft: grün (f95a0b1, Exit 0), rot (e33417b, Exit 1, Jobs, Schritte, Annotationen), kein Lauf (216b794, Exit 2). Skill per Agent ohne und mit Skill getestet.
