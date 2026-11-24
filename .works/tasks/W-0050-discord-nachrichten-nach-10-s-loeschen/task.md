---
id: W-0050
title: "Discord: Nachrichten nach 10 s löschen, Verlauf im Dashboard"
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: [discord]
blocked_by: [W-0041]
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: Nachrichten nach 10 s löschen, Verlauf im Dashboard

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24: Nachrichten sollen nicht erst nach 24 h, sondern nach etwa 10 Sekunden gelöscht werden, deutlich schneller als bisher (W-0044). Dazu ein Verlauf zum Nachschauen. Entscheidungen des Nutzers: Nachrichten, die auf ihn warten (Freigabe, Review mit Knöpfen, Frage von Claude), bleiben stehen, bis sie erledigt sind, und verschwinden 10 s danach; alles andere außer dem Dashboard nach 10 s. Der Verlauf liegt hinter einem Knopf Verlauf im Dashboard und dem Befehl /works verlauf (englisch /works history), nur für ihn sichtbar, nach Projekt filterbar; der Kanal selbst bleibt leer. Standard der Frist wird 10 s, weiter einstellbar (Einheit Sekunden statt nur Stunden). Gestaltung des Verlaufs vorher als Entwurf zeigen. Priorität P2, direkt nach W-0041 (das gerade die Discord-Dateien übersetzt), vor W-0049.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Nachrichten außer Dashboard und wartenden verschwinden nach etwa 10 s
- [ ] Wartende Nachrichten bleiben bis zur Erledigung und verschwinden etwa 10 s danach
- [ ] Knopf Verlauf im Discord-Panel (der angehefteten Dashboard-Nachricht nach D3, neben Warteschlange, Anweisung an Claude, Neue Aufgabe, Hilfe) und /works verlauf zeigen die letzten Nachrichten nur dem Aufrufer, nach Projekt filterbar
- [ ] Der Verlauf übersteht einen Neustart des Bots und ist begrenzt (Anzahl oder Alter)
- [ ] Frist einstellbar in Sekunden (Dialog im Board, works discord set), Standard 10 s
- [ ] Geht beim eigenen und beim gemeinsamen Bot, Tests ohne echtes Discord, auch ohne WebSocket

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
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Beziehung: blocked-by W-0041
- 2026-11-24: Nutzer am 2026-11-24: Knopf Verlauf auch im Discord-Panel (Dashboard-Nachricht in Discord)
- 2026-11-24: Entwurf V1 „Liste, neueste zuerst“ angehängt
- 2026-11-24: Entwurf V2 „Nach Tagen, Eintrag aufklappen“ angehängt
- 2026-11-24: Entwurf V3 „Filter nach Art“ angehängt
- 2026-11-24: Nutzer am 2026-11-24 zu V1 bis V3: bitte besser machen, gern auch mit Bild-Design
- 2026-11-24: Entwurf B1 „Zeitstrahl als Bild“ angehängt
- 2026-11-24: Entwurf B2 „Karten wie im Kanal“ angehängt
- 2026-11-24: Entwurf B3 „Tagesbild und Liste“ angehängt
