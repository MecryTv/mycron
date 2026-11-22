---
id: W-0020
title: board --open öffnet nur, wenn noch kein Tab offen ist
type: feature
priority: P2
status: erledigt
effort: S
risk:
created: 2026-11-21
updated: 2026-11-22
due:
completed: 2026-11-22
milestone:
branch: feature/w-0020-board-open-oeffnet-nur-wenn
tags: [board, live]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# board --open öffnet nur, wenn noch kein Tab offen ist

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-21: Das Board soll selbst prüfen, ob es schon läuft und schon offen ist, damit sich nicht durch einen Fehler ein weiteres Fenster oder ein weiterer Tab öffnet. Heute: works board --serve --detach --open startet den Server oder meldet nur die URL, wenn er schon läuft, und öffnet dann nichts. Claude öffnet die URL danach von Hand (Start-Process), auch wenn das Board schon in einem Tab offen ist, so entstand am 2026-11-21 ein zweiter Tab. Ziel: Der Server weiß, ob gerade ein Board-Tab verbunden ist. --open öffnet den Browser nur, wenn kein Tab verbunden ist, sonst meldet es, dass das Board schon offen ist. Gilt für den Start eines neuen Servers und für einen laufenden.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Läuft der Server ohne offenen Board-Tab, öffnet --open den Browser
- [x] Startet der Server neu, öffnet --open den Browser wie bisher
- [x] Läuft der Server und ist ein Board-Tab offen, öffnet works board --serve --detach --open keinen neuen Tab und sagt das

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [x] Test im Selbsttest mit einem Kindprozess als Tab (RED)
- [x] Probelauf-Schalter WORKS_DRY_OPEN und gemeinsame Funktion openInBrowser
- [x] Server zählt lokale Tabs, Route /tabs
- [x] works board --open öffnet nur ohne Tab, wartet nach einem Start bis 3 s
- [x] Doku: SKILL.md, board.md, cli.md, guten-morgen

## Betroffene Dateien
- `plugins/works/skills/works/scripts/lib.mjs`: openInBrowser
- `plugins/works/skills/works/scripts/serve.mjs`: localTabs, /tabs, --open im Vordergrund
- `plugins/works/skills/works/scripts/works.mjs`: boardTabs, openBoardOnce
- `plugins/works/skills/works/scripts/selftest.mjs`: neuer Schritt, WORKS_DRY_OPEN
- `plugins/works/skills/works/SKILL.md`, `references/board.md`, `references/cli.md`
- `plugins/feierabend/skills/guten-morgen/SKILL.md`: nicht mehr von Hand nachöffnen
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Abgeschlossen am 2026-11-22. Keine offene Übergabe.

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Entscheidung E1 dokumentiert: Offene Tabs über den Event-Stream zählen
- 2026-11-22: Umgesetzt: /tabs im Server, openBoardOnce in der CLI, WORKS_DRY_OPEN, Doku. Handtest mit Kindprozess als Tab: alle drei Fälle richtig. Voller Selbsttest: neuer Schritt rot mit 'fetch failed' (Port aus der Ausgabe nicht erreichbar), außerhalb des Selbsttests nicht nachstellbar; Diagnose eingebaut, Lauf mit --keep läuft.
- 2026-11-22: Übergabe aktualisiert
- 2026-11-22: Selbsttest 25 von 25 grün. Ursache des roten Laufs: fetch im Selbsttest nutzte nach dem Neustart eine tote Keep-Alive-Verbindung (ECONNRESET); Test fragt jetzt einmal neu.
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
