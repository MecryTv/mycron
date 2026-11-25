---
id: W-0063
title: ship öffnet nach dem Neustart des Boards einen zweiten Tab
type: bug
priority: P3
status: erledigt
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed: 2026-11-25
milestone:
branch: fix/w-0063-ship-oeffnet-nach-dem
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
1. Board mit offenem Tab, works ship.
2. ship stoppt das Board, wartet auf die CI und startet es mit --open neu; der Tab verbindet sich erst nach mehr als 3 s wieder, --open öffnet einen zweiten. Im Selbsttest immer (der Tab dort verbindet sich nicht selbst neu).

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
openBoardOnce wartet nach einem Start höchstens 3 s auf Tabs, die sich neu verbinden. Nach Minuten ohne Board verbindet der Browser den Event-Stream langsamer neu.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
ship fragt vor dem Stopp /tabs des Boards; waren Tabs offen, startet es das Board ohne --open, sie verbinden sich auf demselben Port selbst wieder. Ohne offenen Tab wie bisher mit --open. Regressionstest im Schritt „works ship: …“ mit einem offenen /events-Strom.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Nach works ship mit offenem Board-Tab hängt am Ende genau ein Tab am Board

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-25. Keine offene Übergabe.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Priorität: P3 → P3; incomplete: true → false
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Nach works ship mit offenem Board-Tab hängt am Ende genau ein Tab am Board" abgehakt
- 2026-11-25: Übergabe aktualisiert
- 2026-11-25: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
