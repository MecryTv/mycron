---
id: W-0013
title: "Live-Ansicht: Hinweis bei Stillstand einer Aufgabe"
type: feature
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [ui, board]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live-Ansicht: Hinweis bei Stillstand einer Aufgabe

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 4 vom 2026-11-21, vom Nutzer gewünscht. Eine Aufgabe, die seit Tagen "In Arbeit" ist, ohne dass sich etwas tut (keine Werkzeugaufrufe, keine abgehakten Schritte, kein Verlaufseintrag), soll einen Hinweis bekommen, etwa unter "Wartet auf dich": "W-0012 seit 4 Tagen ohne Aktivität, Übergabe fehlt". Die Schwelle (Tage) soll in config.json einstellbar sein. Erst Entwurf zeigen, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Eine Aufgabe in Arbeit ohne Aktivität über der Schwelle erscheint mit Hinweis
- [ ] Der Hinweis sagt, seit wann nichts passiert ist und ob eine Übergabe fehlt
- [ ] Die Schwelle ist in config.json einstellbar, Standard 3 Tage

## Umsetzungsplan
- [ ] Entwurf zeigen, Wahl abwarten
- [ ] Letzte Aktivität je Aufgabe ermitteln
- [ ] Anzeige im Board, Einstellung in config.json
- [ ] Selbsttest mit Browser, Linux, Doku

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
- 2026-11-21: Brainstorming angehängt
- 2026-11-21: Entwurf A „Board-Erweiterungen W-0011 bis W-0014“ angehängt
