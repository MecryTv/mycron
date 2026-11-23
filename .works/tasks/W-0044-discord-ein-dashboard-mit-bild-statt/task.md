---
id: W-0044
title: "Discord: ein Dashboard mit Bild statt Statuspost je Projekt, Status des Bots"
type: feature
priority: P2
status: backlog
effort: L
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch:
tags: [discord, design]
blocked_by: [W-0037]
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: ein Dashboard mit Bild statt Statuspost je Projekt, Status des Bots

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-23 (P2), nach Bild seines echten Kanals mit drei angehefteten Statusposts: Die Nachrichten verbessern, gern mit Bildern, aber nur eine Nachricht, mit Auswahlmenüs und Knöpfen; dazu Statusmeldungen des Bots. Gewählt: Entwurf D3. Eine angeheftete Nachricht für alle Projekte: je Projekt eine Zeile mit Ampel (arbeitet, wartet auf dich, ruhig, CI rot), ein Bild, das works selbst als PNG zeichnet (Fortschritt je Projekt, erledigte Aufgaben der letzten 7 Tage, eingebaute Pixelschrift, kein fremder Dienst, höchstens alle 5 Minuten neu), Auswahlmenü „Projekt wählen“ mit Details nur für den Aufrufer, Knöpfe Warteschlange, Anweisung an Claude, Neue Aufgabe, Hilfe. Status des Bots in der Mitgliederliste (etwa „Trainingsplan wartet auf dich“, „arbeitet an W-0040 (mycron)“, „3 Projekte im Blick“). Ersetzt die Statusposts je Projekt; die alten räumt der Bot auf. Baut auf W-0037 (Befehle und Knöpfe) auf.

Wunsch des Nutzers am 2026-11-23: Der Kanal soll sauber bleiben. Dauerhaft steht dort nur das Dashboard nach D3; alles andere (ship, Commit, CI, erledigt, Berichte und so weiter) bleibt nur eine gewisse Zeit und wird dann vom Bot gelöscht. Gewählt: Frist 24 Stunden, einstellbar. Nachrichten, die auf den Nutzer warten (Freigabe, Claude fertig, Review mit Knöpfen, Frage von Claude), bleiben stehen, solange sie offen sind; ab der Erledigung läuft dieselbe Frist. Gilt beim eigenen und beim gemeinsamen Bot (der Dienst braucht dafür das Löschen eigener Nachrichten).

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Eine angeheftete Dashboard-Nachricht statt je Projekt eine; alte Statusposts werden aufgeräumt
- [ ] Bild nach D3 ohne Abhängigkeiten und ohne fremden Dienst, höchstens alle 5 Minuten neu
- [ ] Auswahlmenü zeigt Projektdetails nur dem Aufrufer, die Knöpfe funktionieren
- [ ] Status des Bots zeigt, was gerade wichtig ist
- [ ] Im Kanal bleibt dauerhaft nur das Dashboard; andere Nachrichten löscht der Bot nach der Frist (Standard 24 h, einstellbar), offene erst 24 h nach ihrer Erledigung
- [ ] Löschen geht beim eigenen und beim gemeinsamen Bot, nur eigene Nachrichten, nichts geht beim Neustart verloren
- [ ] Discord-Grenzen eingehalten, Tests ohne echtes Discord

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
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Entwurf D1 „Übersicht, Details nur für dich“ angehängt
- 2026-11-23: Entwurf D2 „Umblättern“ angehängt
- 2026-11-23: Entwurf D3 „Mit Bild“ angehängt
- 2026-11-23: Entwurf D3 „Mit Bild“ gewählt. Grund: Wahl des Nutzers
- 2026-11-23: Beziehung: blocked-by W-0037
