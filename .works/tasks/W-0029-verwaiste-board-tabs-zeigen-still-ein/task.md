---
id: W-0029
title: Verwaiste Board-Tabs zeigen still ein fremdes Projekt
type: bug
priority: P2
status: backlog
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ui, board, hub]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Verwaiste Board-Tabs zeigen still ein fremdes Projekt

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gefunden am 2026-11-22 bei W-0025, vom Nutzer gewünscht (P2). Endet ein Board (etwa Trainingsplan auf 4748), versucht sein offener Tab alle 2 s neu zu verbinden. Startet danach ein anderes Projekt auf demselben Port, verbindet sich der alte Tab damit, lädt neu und zeigt still das fremde Board. Außerdem zählt er dort als offener Tab für --open. Gewünscht: Der Tab merkt, dass auf seinem Port jetzt ein anderes Projekt läuft, und zeigt einen Hinweis statt umzuschalten, etwa: Hier läuft jetzt mycron statt Trainingsplan, mit Knöpfen Trainingsplan starten (lokal, über den Hub-Mechanismus) und Zum Hub. Ein solcher Tab zählt nicht als Tab des fremden Boards. Gestaltung über Entwürfe mit mockups, Wahl abwarten.

## Reproduktion
1. Board von Projekt A starten (etwa Port 4748) und im Browser öffnen.
2. Board von A stoppen, den Tab offen lassen.
3. Board von Projekt B auf demselben Port starten.
4. Der Tab von A verbindet sich innerhalb von 2 s mit B, lädt neu und zeigt B. Immer.

## Erwartetes Verhalten
Der Tab bleibt bei A und zeigt einen Hinweis, dass auf dem Port jetzt B läuft, mit A starten und Zum Hub. Er zählt nicht als Tab von B.

## Tatsächliches Verhalten
Der Tab zeigt still B. works board --open in B meldet einen offenen Tab, obwohl der Nutzer B nie geöffnet hat.

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
- [ ] Ein verwaister Tab zählt nicht als offener Tab des fremden Boards (--open öffnet dann einen neuen Tab für B)
- [ ] Der Hinweis bietet A starten (nur lokal, mit Token) und Zum Hub
- [ ] Darstellung auf Mobil, Tablet und Desktop korrekt, Kontraste WCAG AA, per Tastatur bedienbar

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Entwurf A „Ersatzseite“ angehängt
- 2026-11-22: Entwurf B „Leiste über dem letzten Stand“ angehängt
- 2026-11-22: Entwurf C „Dialog über dem letzten Stand“ angehängt
- 2026-11-22: Entwurf B „Leiste über dem letzten Stand“ gewählt. Grund: Nutzer am 2026-11-22: Empfehlung genommen. Der letzte Stand bleibt ausgegraut sichtbar, Leiste mit den Knöpfen
