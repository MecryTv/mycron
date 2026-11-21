---
id: W-0005
title: Arbeitsordner je Prüfung und Prüfbefehle mit Anführungszeichen unter Windows
type: feature
priority: P2
status: erledigt
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed: 2026-11-21
milestone:
branch: feature/w-0005-arbeitsordner-je-pruefung-und
tags: [checks, windows]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Arbeitsordner je Prüfung und Prüfbefehle mit Anführungszeichen unter Windows

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 1 vom 2026-11-21. (a) Prüfungen bekommen optional einen eigenen Arbeitsordner (cwd, relativ zum Projekt), damit Befehle wie 'cd /d Discord Bot && npm run -s check:admin' (51 Stück in RL Nexus) ohne cd auskommen. config.checks bleibt rückwärtskompatibel: Wert als Text (Befehl) oder als Objekt {cmd, cwd}. CLI: works checks set name=befehl --cwd ordner; im Board unter Werkzeuge ein Feld Ordner je Prüfung. Bei parallelen Aufgaben gilt der Ordner relativ zum Worktree. (b) Fehler: runOne startet cmd /d /s /c ohne windowsVerbatimArguments, Node maskiert Anführungszeichen dann so, dass cmd sie nicht versteht. Prüfbefehle mit Anführungszeichen (z. B. node -e "..." oder Pfade mit Leerzeichen) laufen unter Windows nicht.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Eine Prüfung mit Anführungszeichen im Befehl läuft unter Windows und Linux
- [x] Eine Prüfung mit Arbeitsordner (cwd) läuft in diesem Ordner, relativ zum Projekt bzw. zum Worktree einer parallelen Aufgabe
- [x] Bestehende config.checks mit reinem Befehl als Text funktionieren unverändert
- [x] works checks set name=befehl --cwd ordner speichert den Ordner, works checks zeigt ihn
- [x] Im Board unter Werkzeuge lässt sich der Ordner je Prüfung eintragen
- [x] Selbsttest prüft Anführungszeichen und Arbeitsordner

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
Abgeschlossen am 2026-11-21. Keine offene Übergabe.

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: Akzeptanzkriterien: "Eine Prüfung mit Arbeitsordner (cwd) läuft in diesem Ordner, relativ zum Projekt bzw. zum Worktree einer parallelen Aufgabe" ergänzt
- 2026-11-21: Akzeptanzkriterien: "Bestehende config.checks mit reinem Befehl als Text funktionieren unverändert" ergänzt
- 2026-11-21: Akzeptanzkriterien: "works checks set name=befehl --cwd ordner speichert den Ordner, works checks zeigt ihn" ergänzt
- 2026-11-21: Akzeptanzkriterien: "Im Board unter Werkzeuge lässt sich der Ordner je Prüfung eintragen" ergänzt
- 2026-11-21: Akzeptanzkriterien: "Selbsttest prüft Anführungszeichen und Arbeitsordner" ergänzt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Akzeptanzkriterien: "Eine Prüfung mit Anführungszeichen im Befehl läuft unter Windows und Linux" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Eine Prüfung mit Arbeitsordner (cwd) läuft in diesem Ordner, relativ zum Projekt bzw. zum Worktree einer parallelen Aufgabe" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Bestehende config.checks mit reinem Befehl als Text funktionieren unverändert" abgehakt
- 2026-11-21: Akzeptanzkriterien: "works checks set name=befehl --cwd ordner speichert den Ordner, works checks zeigt ihn" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Im Board unter Werkzeuge lässt sich der Ordner je Prüfung eintragen" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Selbsttest prüft Anführungszeichen und Arbeitsordner" abgehakt
- 2026-11-21: Umgesetzt: cwd je Prüfung, Windows-Quoting, Board-Feld Ordner, checksSave über --file; selftest Windows mit Browser und Linux 21/21
- 2026-11-21: In main gemergt (a373cc7), selftest --browser auf main 21/21, gepusht
- 2026-11-21: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
