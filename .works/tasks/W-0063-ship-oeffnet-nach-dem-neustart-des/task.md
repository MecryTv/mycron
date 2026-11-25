---
id: W-0063
title: ship öffnet nach dem Neustart des Boards einen zweiten Tab
type: bug
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch:
tags: [board, ship]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# ship öffnet nach dem Neustart des Boards einen zweiten Tab

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Beobachtet am 2026-11-25 beim Ausliefern von W-0054: ship stoppt das Board, wartet auf die CI (mehrere Minuten) und startet es dann mit --open neu. openBoardOnce wartet nur 3 s auf Tabs, die sich neu verbinden. Nach der langen Pause verband sich der offene Tab später (Browser verbinden einen Event-Stream nach vielen Fehlversuchen langsamer neu), works öffnete deshalb einen zweiten Tab; danach hingen zwei Tabs am Board (/tabs: 2). Bei früheren ship-Läufen hieß es „schon in einem Browser-Tab offen“. Vorschlag: Nach einem Neustart durch ship länger warten (etwa bis 15 s, sobald ein Tab da ist sofort weiter) oder vor dem Stopp die Zahl der Tabs merken und nur öffnen, wenn vorher keiner offen war.

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
- [ ] Nach works ship mit offenem Board-Tab hängt am Ende genau ein Tab am Board

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Priorität: P3 → P3; incomplete: true → false
