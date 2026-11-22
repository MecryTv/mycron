---
id: W-0026
title: "Skill ship: Abschluss einer Aufgabe in einem Rutsch"
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [skill, workflow, git]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Skill ship: Abschluss einer Aufgabe in einem Rutsch

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (alles einbauen, P2). Der Abschluss jeder Aufgabe ist jedes Mal derselbe Ablauf mit bekannten Fallen: Board stoppen, git restore .works/WORKS.md .works/time.jsonl, Merge mit --no-ff in den Hauptbranch, works done --confirm, .works committen und pushen, CI-Wächter auf den letzten Commit des Pushes, bei Plugin-Repos claude plugin marketplace update und claude plugin update für jedes Plugin, Board mit der neuen Version neu starten (--open öffnet nur ohne offenen Tab). Fallen aus der Praxis: CI lief auf dem falschen Commit (mehrere Commits in einem Push, nur der letzte hat einen Lauf), WORKS.md und time.jsonl machen Merge-Konflikte, Branch danach löschen. Ein Skill ship soll das in einem Rutsch erledigen und nur bei Problemen anhalten (Tests rot, Merge-Konflikt, CI rot, Definition of Done nicht erfüllt). Push bleibt ein Schritt, den der Nutzer mit dem Aufruf des Skills freigibt. Offen: ob ship in works oder workday gehört.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Ein Aufruf von ship schließt die aktive Aufgabe ab: Board gestoppt, WORKS.md und time.jsonl zurückgesetzt, Merge mit --no-ff, works done --confirm, .works committet, gepusht, Feature-Branch gelöscht
- [ ] Der CI-Wächter läuft auf dem letzten Commit des Pushes, nicht auf einem früheren
- [ ] In einem Plugin-Repo werden Marketplace und alle Plugins des Repos aktualisiert; das Board startet danach mit der neuen Version, ohne zweiten Tab
- [ ] ship hält an und meldet, wenn Tests rot sind, die Definition of Done nicht erfüllt ist, ein Merge-Konflikt auftritt oder die CI rot ist; nichts wird dann gepusht
- [ ] Ohne Remote oder ohne CI überspringt ship die Schritte mit einem Hinweis statt abzubrechen
- [ ] Skill-Name englisch, Inhalt deutsch; Ablauf mit einem Testszenario geprüft

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] 

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->
- [x] Gehört ship ins Plugin works (works:ship) oder ins Plugin workday? Antwort des Nutzers am 2026-11-22: ins Plugin works, als works:ship.

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Frage geklärt: ship kommt als works:ship ins Plugin works
