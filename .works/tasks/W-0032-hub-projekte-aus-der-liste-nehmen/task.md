---
id: W-0032
title: "Hub: Projekte aus der Liste nehmen"
type: feature
priority: P2
status: backlog
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ui, hub]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Hub: Projekte aus der Liste nehmen

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (P2, erst Entwürfe). Im Hub standen Testprojekte aus Temp-Ordnern unter Gestoppt, sie ließen sich nur durch Löschen der Ordner entfernen. Gewünscht: bei gestoppten Projekten ein Knopf Aus der Liste (mit Rückfrage, nur lokal mit Token), der den Eintrag aus ~/.works/projects.json nimmt; der Ordner bleibt unberührt. Projekte in Temp-Ordnern (os.tmpdir) werden gar nicht erst eingetragen. Gestaltung über Entwürfe mit mockups, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Gestoppte Projekte im Hub haben einen Knopf, der sie nach Rückfrage aus der Liste nimmt; der Projektordner bleibt unverändert
- [ ] Entfernen geht nur lokal mit dem Token der Seite, laufende Boards lassen sich so nicht entfernen
- [ ] Projekte in Temp-Ordnern werden nicht in ~/.works/projects.json eingetragen
- [ ] Darstellung auf Mobil, Tablet und Desktop korrekt, Kontraste WCAG AA, per Tastatur bedienbar

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
