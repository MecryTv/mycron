---
id: W-0035
title: Szenarien für works shot
type: feature
priority: P4
status: backlog
effort: L
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [shot, playwright]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Szenarien für works shot

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (P4). Für Bilder bestimmter Zustände (verwaister Tab, wartende Freigabe, Abnahmedialog) wurden eigene Playwright-Skripte geschrieben: Wegwerf-Projekte mit eigenem HOME anlegen, Boards auf freien Ports starten, Hooks auslösen, klicken, aufnehmen. Gewünscht: works shot kann vor dem Aufnehmen eine kleine Szenario-Datei ausführen (Projekte, Aufgaben, Boards, Hooks, Klicks, Wartezeiten), räumt danach auf und nutzt dieselbe Prüfung auf Probleme wie heute.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] works shot führt vor dem Aufnehmen eine Szenario-Datei aus: Projekte und Aufgaben anlegen, Boards starten, Hooks auslösen, klicken, warten
- [ ] Das Szenario läuft mit eigenem HOME und freien Ports, berührt keine echten Projekte und räumt danach auf
- [ ] Die Bilder durchlaufen dieselbe Prüfung auf Probleme wie heute
- [ ] Die drei Szenarien vom 2026-11-22 (verwaister Tab, wartende Freigabe, Abnahmedialog) lassen sich damit nachbauen

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
