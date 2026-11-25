---
id: W-0056
title: "Discord: Status des Bots allgemein statt aufgabenbezogen"
type: bug
priority: P2
status: backlog
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch:
tags: [discord]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: Status des Bots allgemein statt aufgabenbezogen

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Wunsch des Nutzers am 2026-11-25: Die Statusmeldungen des works-Discord-Bots sollen allgemein sein und nicht für einzelne Aufgaben. Heute setzt statusLine() in discord-bot.mjs zum Beispiel „arbeitet an W-0050 (mycron)“; auch „mycron wartet auf deine Freigabe“ und „mycron wartet auf dich“ nennen je ein Projekt. Gewünscht ist ein allgemeiner Status ohne Aufgaben-ID, etwa wie die Zusammenfassung im Panel („2 warten auf dich · 1 arbeitet“). Ergänzung des Nutzers am 2026-11-25: Weil der Bot (vor allem der gemeinsame) mehr Nutzer bekommen kann, noch allgemeiner fassen, ohne Projektnamen und ohne Aufgaben, etwa wie viele Leute works gerade nutzen. Fällt W-0050 vorher fertig an, dort nicht mit hineinmischen; eigener Fix nach W-0050.

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
- [ ] Der Status des Bots nennt keine Aufgaben-ID mehr
- [ ] Der Status nennt keine Projektnamen und passt für viele Nutzer, etwa „x Leute nutzen works“ (Zahl beim gemeinsamen Bot aus dem Dienst)

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Priorität: P3 → P2; incomplete: true → false
- 2026-11-25: Nutzer: P2; Status noch allgemeiner, ohne Projekte, etwa wie viele Leute works nutzen
