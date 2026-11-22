---
id: W-0028
title: "Hub: Browser-Hinweis, wenn Claude auf eine Freigabe wartet"
type: feature
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ui, hub, board]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Hub: Browser-Hinweis, wenn Claude auf eine Freigabe wartet

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (alles einbauen, P3). Der Hub (W-0025) kennt über alle Projekte hinweg, wo Claude auf eine Freigabe wartet (activity.json, perm). Liegt der Tab im Hintergrund, soll eine Browser-Benachrichtigung erscheinen: Projekt, was freigegeben werden soll, Klick öffnet das Board. Nur einmal je Freigabe, nicht bei jeder Aktualisierung. Die Erlaubnis für Benachrichtigungen fragt der Browser erst nach einem Klick des Nutzers (Schalter im Hub-Kopf). Gestaltung über Entwürfe mit mockups, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Wartet Claude in einem Projekt auf eine Freigabe und liegt der Hub-Tab im Hintergrund, erscheint eine Browser-Benachrichtigung mit Projekt und Freigabe
- [ ] Je Freigabe genau eine Benachrichtigung, nicht bei jeder Aktualisierung
- [ ] Die Erlaubnis wird erst nach einem Klick im Hub abgefragt; ohne Erlaubnis bleibt alles wie heute
- [ ] Klick auf die Benachrichtigung öffnet das Board des Projekts im Hub-Tab
- [ ] Darstellung des Schalters auf Mobil, Tablet und Desktop korrekt, Kontraste WCAG AA, per Tastatur bedienbar

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
