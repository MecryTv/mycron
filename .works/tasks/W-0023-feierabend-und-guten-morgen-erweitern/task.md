---
id: W-0023
title: Feierabend und Guten Morgen erweitern
type: feature
priority: P4
status: in-arbeit
effort:
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch: feature/w-0023-feierabend-und-guten-morgen
tags: [skill, plugin]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Feierabend und Guten Morgen erweitern

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vom Nutzer am 2026-11-22 für später vorgemerkt: die Skills Feierabend und Guten Morgen (Plugin workday, Skills end-of-day und good-morning) erweitern. Was genau dazukommen soll, ist noch offen und wird mit dem Nutzer geklärt.

Am 2026-11-22 mit dem Nutzer festgelegt (alle acht Vorschläge gewählt): Guten Morgen prüft die CI des letzten Pushes (ci-watch), zeigt Entwürfe ohne Wahl als Playwright-Screenshots im Superpowers-Begleiter, nennt Fälliges von heute (überfällig, heute fällig, Meilensteine, wiederkehrende) und bietet Plugin-Updates aus dem Marketplace an. Feierabend nennt nicht gepushte Commits und bietet den Push an (nie ungefragt), nimmt den Verbrauch des Tages (Tokens, Kosten) in die Bilanz, räumt Hintergrundprozesse auf (Test-Server, Superpowers-Begleiter) und speichert den Tagesbericht in .works/reports.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] good-morning: CI des letzten Pushes steht in der Nachricht, rot kommt unter Wartet auf dich und nach vorn
- [ ] good-morning: Entwürfe ohne Wahl werden als Screenshots im Superpowers-Begleiter gezeigt
- [ ] good-morning: Überfälliges, heute Fälliges, nahe Meilensteine und wiederkehrende Aufgaben von heute werden genannt
- [ ] good-morning: verfügbare Plugin-Updates werden angeboten, nicht ungefragt installiert
- [ ] end-of-day: nicht gepushte Commits werden genannt und der Push angeboten, nie ungefragt
- [ ] end-of-day: Verbrauch des Tages (Tokens, Kosten) steht in der Bilanz (works time --today)
- [ ] end-of-day: von Claude gestartete Hintergrundprozesse und Begleiter werden beendet, Prozesse des Nutzers nicht
- [ ] end-of-day: Tagesbericht liegt als Datei in .works/reports

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
- 2026-11-22: incomplete: true → false
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
