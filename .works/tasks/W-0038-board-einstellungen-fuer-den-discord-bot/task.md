---
id: W-0038
title: "Board: Einstellungen für den Discord-Bot"
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch:
tags: [ui, discord, board]
blocked_by: [W-0036]
blocks: []
related: []
source: manuell
incomplete: false
---

# Board: Einstellungen für den Discord-Bot

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Teil der Discord-Anbindung (siehe W-0036), Wunsch des Nutzers vom 2026-11-23 (P2): Einstellungen nach Entwurf D, aber komplett verbessert. Verbindungsstatus, Einrichtung in Schritten (Bot anlegen, Token, Server einladen, Kanal wählen), Erwähnung, Ereignisse, Datenschutz, Befehle. Token nie im Board sichtbar. Gestaltung über Entwürfe, Wahl abwarten.

Gewählt: Entwurf J2 (Dialog mit Reitern und Vorschau), Einrichtung nach R aus W-0040 (gemeinsamer oder eigener Bot). Wunsch des Nutzers am 2026-11-23 (P2): Im Board selbst den Kanal auswählen können, auf dem Discord-Server, auf den der Bot eingeladen ist. Gewählt: Entwurf K (Server und Kanäle live vom Bot, gesperrte ausgegraut, „Hierher verschieben“ legt das Dashboard aus W-0044 im neuen Kanal an und räumt den alten auf).

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
<!-- Prüfbare Aussagen. Jede Zeile muss sich mit ja oder nein beantworten lassen. -->
- [ ] Dialog Discord-Bot im Board nach J2 mit den Reitern Verbindung, Projekte, Ereignisse, Befehle, Datenschutz und Vorschau
- [ ] Einrichtung nach R: gemeinsamer Bot mit Code oder eigener Bot mit Token, Token und Schlüssel nie sichtbar
- [ ] Kanalwahl nach K: Server und Textkanäle live vom Bot, Kanäle ohne Schreibrecht ausgegraut, Verschieben des Dashboards
- [ ] Änderungen wirken ohne Neustart des Bots
- [ ] Selbsttest mit Browser deckt Dialog und Kanalwahl ab

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

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Entwurf I „Seitenleiste Discord-Bot“ angehängt
- 2026-11-23: Entwurf J „Dialog mit Vorschau“ angehängt
- 2026-11-23: Entwurf K „Einrichtung in Schritten“ angehängt
- 2026-11-23: decisions.md angelegt
- 2026-11-23: Entscheidung E1 dokumentiert: Einstellungen nach Entwurf J
- 2026-11-23: Entwurf J2 „J verbessert“ angehängt
- 2026-11-23: Entwurf J2 „J verbessert“ gewählt. Grund: Wahl des Nutzers: J verbessert
- 2026-11-23: Beziehung: blocked-by W-0040
- 2026-11-23: Entwurf K „Kanal im Board wählen“ angehängt
- 2026-11-23: Entwurf J2 „J verbessert“ gewählt. Grund: Wahl des Nutzers (J verbessert), dazu K für die Kanalwahl
- 2026-11-23: Beziehung entfernt: blocked-by W-0040
