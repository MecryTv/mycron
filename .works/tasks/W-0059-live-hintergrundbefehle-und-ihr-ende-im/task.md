---
id: W-0059
title: "Live: Hintergrundbefehle und ihr Ende im Board anzeigen"
type: feature
priority: P2
status: review
effort: M
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: feature/w-0059-live-hintergrundbefehle-und
tags: [board, live]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live: Hintergrundbefehle und ihr Ende im Board anzeigen

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-25: Läuft bei Claude etwas im Hintergrund (Bash mit run_in_background, etwa ein Selbsttest), soll das im Board unter Live zu sehen sein. Heute nicht: activity.json kennt nur current, recent, busy und lanes; der PostToolUse-Hook sieht den Aufruf sofort als beendet, weil das Werkzeug gleich mit „Command running in background with ID: …“ zurückkommt. Hinweise für die Umsetzung: Die Rückgabe nennt ID und Ausgabedatei (…\tasks\<id>.output); an deren Ende steht „[exited with code N]“, sobald der Befehl fertig ist. Daraus lassen sich laufend, fertig und Exit-Code ablesen, ohne den Befehl selbst anzufassen. Hintergrund-Agenten zeigt die Kopfleiste schon als Anzahl.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Ein Hintergrundbefehl erscheint unter Live mit Beschreibung und Laufzeit, solange er läuft, und danach als fertig mit Ergebnis (Exit-Code)

## Umsetzungsplan
- [x] Tests zuerst: Hook, Board-Daten, Browser
- [x] PostToolUse: Hintergrundbefehl in activity.json festhalten
- [x] Board-Daten: Stand aus dem Ende der Ausgabedatei, Board lädt bei Ende neu
- [x] Live-Ansicht: Abschnitt Im Hintergrund
- [x] Doku: board.md und hooks.md, deutsch und englisch
- [x] Volle Selbsttests, Selbstprüfung des Diffs

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Stand: 2026-11-25 19:34

Umgesetzt in Commit 01f9c42 auf feature/w-0059-live-hintergrundbefehle-und. PostToolUse trägt Befehle mit backgroundTaskId unter background in activity.json ein (live.mjs: recordBackground, findBgOutput); boardData liefert je Befehl Stand und Exit-Code aus den letzten 512 Byte der Ausgabedatei (bgStatus, backgroundOf), ohne Pfad und Ausgabe; der Fingerabdruck in serve.mjs enthält den Stand, damit das Board beim Ende nachlädt. Live-Ansicht: Abschnitt Im Hintergrund über den Prüfungen (board.js lvBgHtml), Texte in de.json, Doku in board.md und hooks.md. Tests: Selbsttest-Schritt 'Live: Hintergrundbefehle und ihr Ende', data.json des Test-Boards, Browserprüfung inklusive Ende ohne Neuladen; mit Browser 66/66, ohne WebSocket 57/57. Offen für die Abnahme: im echten Board einmal einen Befehl mit run_in_background starten und zusehen, wie er von läuft auf Exit-Code wechselt. Grenzen: Hintergrund-Agenten zählen nicht mit; was zwölf Stunden ohne Exit-Zeile läuft, gilt als verwaist und verschwindet.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Priorität: P3 → P2; incomplete: true → false
- 2026-11-25: Parallel gestartet im Worktree W-0059-live-hintergrundbefehle (Status: backlog → in-arbeit)
- 2026-11-25: Umsetzungsplan: "Tests zuerst: Hook, Board-Daten, Browser" ergänzt
- 2026-11-25: Umsetzungsplan: "PostToolUse: Hintergrundbefehl in activity.json festhalten" ergänzt
- 2026-11-25: Umsetzungsplan: "Board-Daten: Stand aus dem Ende der Ausgabedatei, Board lädt bei Ende neu" ergänzt
- 2026-11-25: Umsetzungsplan: "Live-Ansicht: Abschnitt Im Hintergrund" ergänzt
- 2026-11-25: Umsetzungsplan: "Doku: board.md und hooks.md, deutsch und englisch" ergänzt
- 2026-11-25: Umsetzungsplan: "Volle Selbsttests, Selbstprüfung des Diffs" ergänzt
- 2026-11-25: Umsetzungsplan: "Tests zuerst: Hook, Board-Daten, Browser" abgehakt
- 2026-11-25: Tests zuerst: Selbsttest-Schritt 'Live: Hintergrundbefehle und ihr Ende', data.json des Test-Boards und Browserprüfung; Hook und Board laufen dabei mit TMP im Testordner. Schritt ist rot, solange die Umsetzung fehlt.
- 2026-11-25: Umsetzungsplan: "PostToolUse: Hintergrundbefehl in activity.json festhalten" abgehakt
- 2026-11-25: Umsetzungsplan: "Board-Daten: Stand aus dem Ende der Ausgabedatei, Board lädt bei Ende neu" abgehakt
- 2026-11-25: Entscheidung: Fertige Hintergrundbefehle bleiben eine Stunde nach dem Ende stehen, Einträge ohne bekannten Stand eine Stunde nach dem Start; alles, was älter als zwölf Stunden ist, gilt als verwaist (Sitzung beendet ohne Exit-Zeile) und fällt weg. Nur Befehle (tool_input.command) zählen, keine Hintergrund-Agenten. Der Board-Fingerabdruck nimmt den Stand je Befehl auf, nicht die Änderungszeit der Ausgabe, damit gesprächige Befehle das Board nicht jede Sekunde neu laden.
- 2026-11-25: Umsetzungsplan: "Live-Ansicht: Abschnitt Im Hintergrund" abgehakt
- 2026-11-25: Umsetzungsplan: "Doku: board.md und hooks.md, deutsch und englisch" abgehakt
- 2026-11-25: Live-Ansicht: Abschnitt Im Hintergrund über den Prüfungen in der rechten Spalte, mit den Zeilen der Prüfungsliste (Spinner, grünes Häkchen bei Exit-Code 0, rotes Kreuz sonst). Kein neues CSS. Erster voller Browser-Selbsttest: 66 von 66 grün, Bildschirmfotos 1440 hell und 390 dunkel angesehen.
- 2026-11-25: Umsetzungsplan: "Volle Selbsttests, Selbstprüfung des Diffs" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Ein Hintergrundbefehl erscheint unter Live mit Beschreibung und Laufzeit, solange er läuft, und danach als fertig mit Ergebnis (Exit-Code)" abgehakt
- 2026-11-25: Abschlusstests: Selbsttest mit Browser 66 von 66, ohne WebSocket 57 von 57 grün, kein Schritt erst rot und dann grün.
- 2026-11-25: Übergabe aktualisiert
- 2026-11-25: Status: in-arbeit → review (Grund: Agent fertig)
