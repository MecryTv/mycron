---
id: W-0015
title: "Neues Plugin: Feierabend und Guten Morgen"
type: feature
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch: feature/w-0015-neues-plugin-feierabend-und
tags: [skill, plugin]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Neues Plugin: Feierabend und Guten Morgen

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Neuer Skill 1 vom 2026-11-21, vom Nutzer gewünscht, als eigenes Plugin im Marketplace mycron (plugins/feierabend o. ä.). Hintergrund: Der Nutzer beendet Arbeitstage mit "Board stoppen, wir machen morgen weiter" und beginnt mit "setz das um, wie wir gestern besprochen haben". "Feierabend": für jede Aufgabe in Arbeit eine Übergabe schreiben (works handoff), .works committen (nur wenn das Projekt .works im Git hat), das Board stoppen und kurz zusammenfassen, was heute erledigt wurde und was morgen ansteht. "Guten Morgen": Übergaben und Zusammenfassung von gestern lesen, das Board starten und im Browser öffnen, die wichtigste Aufgabe nennen und auf Wunsch beginnen. Funktioniert nur in Projekten mit .works; ohne works einen klaren Hinweis geben.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] "Feierabend" schreibt Übergaben für alle Aufgaben in Arbeit, stoppt das Board und fasst den Tag zusammen
- [ ] "Guten Morgen" liest den Stand von gestern, startet das Board und nennt die nächste Aufgabe
- [ ] Ohne .works im Projekt gibt es einen verständlichen Hinweis statt eines Fehlers
- [ ] Das Plugin steht im Marketplace mycron und lässt sich installieren
- [ ] Nichts wird ungefragt gepusht

## Umsetzungsplan
- [ ] Ablauf und Auslöser festlegen (Skill-Beschreibung)
- [ ] Plugin-Gerüst im Marketplace mycron
- [ ] Skill Feierabend
- [ ] Skill Guten Morgen
- [ ] Test in einem Testprojekt, Doku, README

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
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
