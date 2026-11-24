---
id: W-0051
title: Discord-Panel zeigt Projekte ohne .works-Ordner
type: bug
priority: P2
status: backlog
effort: S
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

# Discord-Panel zeigt Projekte ohne .works-Ordner

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gemeldet vom Nutzer am 2026-11-24 mit Bild seines echten Kanals: Das Panel (Dashboard nach D3) zeigte 6 Projekte, darunter mod1-de, mod1-smoke und w3-en, Testprojekte aus der Arbeit an W-0041, deren Ordner längst gelöscht sind. Wunsch: nur Projekte zeigen, in deren Ordner .works wirklich installiert ist, und ähnliche Fälle (Ordner weg, .works entfernt, aus projects.json verschwunden). Ursache vermutlich: Der Bot behält den letzten Stand jedes je gesehenen Projekts in state.json (state.projects) und nutzt ihn für Panel, Status des Bots und /works status weiter, auch wenn der Ordner fehlt. Die Registrierung kam daher, dass ein Test-Agent Testprojekte mit dem echten HOME angelegt hat (abgestellt). Entscheidung des Nutzers: P2, nach W-0041 zusammen mit W-0050.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. 

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] Panel, Status des Bots und /works status zeigen nur Projekte, deren Ordner .works/config.json hat
- [ ] Projekte, die nicht mehr in projects.json stehen oder deren Ordner fehlt, verschwinden auch aus state.json des Bots
- [ ] Ein Projekt, das kurz nicht lesbar ist (etwa beim Branch-Wechsel), fällt nicht sofort heraus

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Beziehung: blocked-by W-0041
