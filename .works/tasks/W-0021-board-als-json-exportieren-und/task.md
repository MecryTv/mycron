---
id: W-0021
title: Board als JSON exportieren und importieren
type: design
priority: P3
status: backlog
effort: M
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ui, design, board, export, import]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Board als JSON exportieren und importieren

## Ziel
<!-- Welches Gestaltungsproblem wird gelöst? -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-22: Das aktuelle Board soll sich als JSON exportieren und wieder importieren lassen, mit passendem Design im Board. Heute gibt es nur works export (HTML-Schnappschuss zum Teilen, im Board unter Teilen oder exportieren) und works import (Trello, Notion, Linear, CSV, Excel, Word, Markdown, legt nur neue Aufgaben an, im Board unter Werkzeuge, Importieren). Ein JSON des eigenen Boards mit allen Aufgaben und ihren Feldern fehlt, ebenso das Einlesen eines solchen JSON. Zu klären im Entwurf: Umfang des Exports (Aufgaben mit Beschreibung, Kriterien, Plan, Verlauf, Kommentare, Entscheidungen; dazu Meilensteine, Warteschlange, Sprint, Projektwissen, Wiederkehrendes; Bilder und Entwürfe ja oder nein), Import als Zusammenführen (neue IDs, Duplikate erkennen) oder Wiederherstellen (ersetzt den Stand, mit Sicherung vorher), Vorschau vor dem Import wie beim bestehenden Import, Rückgängig. Auch als CLI-Befehl. Ablauf: Entwürfe mit dem Plugin entwurf, Wahl des Nutzers abwarten, dann umsetzen.

## Zielgruppe und Kontext
<!-- Wer nutzt die Oberfläche, auf welchen Geräten, in welcher Situation? -->

## Referenzen
<!-- Bestehende Seiten, Vorbilder, Markenvorgaben. Bilder über `works asset --kind referenz`. -->

## Varianten
<!-- Untersuchte Richtungen. Ausführliche Begründungen in decisions.md. -->

## Gewählte Lösung
<!-- Kurzbeschreibung des Ergebnisses. -->

## Akzeptanzkriterien
- [ ] Darstellung ist auf Mobil, Tablet und Desktop korrekt
- [ ] Kontraste erfüllen WCAG AA
- [ ] Bedienung per Tastatur ist möglich
- [ ] Im Board und per CLI lässt sich das Board als eine JSON-Datei herunterladen
- [ ] Ein solches JSON lässt sich im Board und per CLI wieder einlesen, mit Vorschau vor dem Übernehmen
- [ ] Export und Import ergeben denselben Stand (Aufgaben, Felder, Kommentare, Entscheidungen)
- [ ] Ein Import lässt sich rückgängig machen

## Umsetzungsplan
- [x] Verhalten (E1) mit dem Nutzer klären
- [ ] Export: Modul backup.mjs, works export --json, Test
- [ ] Import: Abgleich, Zusammenführen, Wiederherstellen mit Sicherung, Rückgängig, works import für works-JSON, Test
- [ ] Board: API und Dialog Sichern und Wiederherstellen, Fuß der Dialoge, Browser-Test
- [ ] Doku, Selbsttest Windows mit Browser, CI

## Betroffene Dateien

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Ist-Zustand mit --kind ist oder vorher, Ergebnis mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Entwurf A „An Teilen und Import andocken“ angehängt
- 2026-11-22: Entwurf B „Eigener Dialog Sichern und Wiederherstellen“ angehängt
- 2026-11-22: Entwurf B „Eigener Dialog Sichern und Wiederherstellen“ gewählt. Grund: Nutzer am 2026-11-22 im Superpowers-Begleiter: eigener Dialog Sichern und Wiederherstellen
