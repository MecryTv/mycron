---
id: W-0026
title: "Skill ship: Abschluss einer Aufgabe in einem Rutsch"
type: feature
priority: P2
status: erledigt
effort: M
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed: 2026-11-22
milestone:
branch: feature/w-0026-skill-ship-abschluss-einer
tags: [skill, workflow, git]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
reopened: 1
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
- [x] Ein Aufruf von ship schließt die aktive Aufgabe ab: Board gestoppt, WORKS.md und time.jsonl zurückgesetzt, Merge mit --no-ff, works done --confirm, .works committet, gepusht, Feature-Branch gelöscht
- [x] Der CI-Wächter läuft auf dem letzten Commit des Pushes, nicht auf einem früheren
- [x] In einem Plugin-Repo werden Marketplace und alle Plugins des Repos aktualisiert; das Board startet danach mit der neuen Version, ohne zweiten Tab
- [x] ship hält an und meldet, wenn Tests rot sind, die Definition of Done nicht erfüllt ist, ein Merge-Konflikt auftritt oder die CI rot ist; nichts wird dann gepusht
- [x] Ohne Remote oder ohne CI überspringt ship die Schritte mit einem Hinweis statt abzubrechen
- [x] Skill-Name englisch, Inhalt deutsch; Ablauf mit einem Testszenario geprüft

## Umsetzungsplan
- [x] Selbsttest: Projekt mit lokalem Remote; ship hält bei offener DoD und nicht committeter Datei an, sonst Merge, done, Push, Branch gelöscht, neue Zeiten in time.jsonl genau einmal
- [x] ship.mjs mit works ship im CLI, selftest --only für schnelle Läufe
- [x] Skill works:ship (skills/ship/SKILL.md), mit einem Agenten an drei Szenarien geprüft
- [x] Nachbesserungen: Zeiten direkt nach dem Merge zurückschreiben, neue nicht verfolgte Dateien melden, Board bei Abbruch und am Ende auf demselben Port neu starten
- [x] Doku, Selbsttest mit Browser, Abschluss mit works ship selbst

## Betroffene Dateien
- plugins/works/skills/works/scripts/ship.mjs (neu): Ablauf von works ship
- plugins/works/skills/works/scripts/works.mjs: Befehl ship, selftest --only
- plugins/works/skills/works/scripts/selftest.mjs: Schritt works ship, Option only
- plugins/works/skills/ship/SKILL.md (neu): Skill works:ship
- plugins/works/skills/works/SKILL.md, references/cli.md: Doku

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->
- [x] Gehört ship ins Plugin works (works:ship) oder ins Plugin workday? Antwort des Nutzers am 2026-11-22: ins Plugin works, als works:ship.

## Übergabe
Abgeschlossen am 2026-11-22. Keine offene Übergabe.

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Frage geklärt: ship kommt als works:ship ins Plugin works
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: works ship mit Selbsttest (DoD offen, offene und neue Dateien, Remote weg mit Board-Neustart, Erfolg mit Board und time.jsonl), Skill works:ship mit drei Szenarien geprüft und nachgeschärft. CI-Wächter und Plugin-Update werden beim Abschluss von W-0026 mit ship selbst am echten Repo nachgewiesen
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
- 2026-11-22: Wiedereröffnet (Status: erledigt → backlog). Grund: CI rot auf allen Windows-Runnern (a5cfc20): ship verrechnet den 8.3-Kurzpfad des Temp-Ordners (RUNNER~1) mit dem langen Pfad aus git rev-parse, WORKS.md wird nicht zurückgesetzt, der Wechsel nach main scheitert. Lokal mit TMP=...\LANGER~1 nachgestellt.
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: Ursache CI rot unter Windows: Projektordner mit 8.3-Kurznamen (RUNNER~1), git rev-parse --show-toplevel liefert den langen Pfad, path.relative ergab Pfade außerhalb des Repos. Fix: Repo-Wurzel über --show-cdup relativ zum Projektordner. Lokal nachgestellt und geprüft mit TMP=...\LANGER~1. Meldung bei CI rot korrigiert (Board startet doch neu).
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
