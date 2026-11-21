---
id: W-0017
title: "Neues Plugin: CI-Wächter für GitHub Actions"
type: feature
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
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
- [ ] Nach einem Push meldet der Skill das Ergebnis des CI-Laufs zum Commit
- [ ] Bei rot nennt er Job und Fehlerstelle
- [ ] Funktioniert ohne gh bei öffentlichen Repos
- [ ] Abfragen höchstens alle 30 Sekunden, mit Zeitlimit

## Umsetzungsplan
- [ ] Ablauf und Auslöser festlegen
- [ ] Plugin-Gerüst und Abfrageskript
- [ ] Fehlerstelle aus Job-Logs
- [ ] Test am Repo mycron, Doku

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
