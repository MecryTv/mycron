---
id: W-0055
title: "Kopfleiste im Board: Live-Anzeige von Claude bei langem Text kaputt"
type: bug
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-24
updated: 2026-11-24
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

# Kopfleiste im Board: Live-Anzeige von Claude bei langem Text kaputt

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gemeldet vom Nutzer am 2026-11-24 mit Screenshot: In der Kopfleiste des Boards ist die Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 Agent“ zu lang. Sie drückt sich an die Ansichtswahl (Board, Sprint, Warteschlange …), die Zeit steht als eigenes Kästchen mitten im Satz, und vor dem Komma steht ein Leerzeichen („1 min , 1 Agent“). Wunsch: Die Leiste soll auch bei langem Text sauber aussehen.

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
- [ ] Bei langem Text bleibt die Live-Anzeige in ihrem Platz (gekürzt mit …, voller Text als Tooltip) und überdeckt oder verschiebt die Ansichtswahl nicht

## Betroffene Dateien

## Assets
![Kopfleiste des Boards: Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 A](assets/2026-11-24-kopfleiste-des-boards-live-anzeige-vorher.png)
Beschreibung: Kopfleiste des Boards: Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 Agent“ drückt gegen die Ansichtswahl, Zeit als eigenes Kästchen, Leerzeichen vor dem Komma
Art: vorher · Hinzugefügt: 2026-11-24

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Asset hinzugefügt: assets/2026-11-24-kopfleiste-des-boards-live-anzeige-vorher.png (vorher)
