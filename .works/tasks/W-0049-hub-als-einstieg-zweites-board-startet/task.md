---
id: W-0049
title: "Hub als Einstieg: zweites Board startet nicht selbst, Port erst beim Klick im Hub"
type: feature
priority: P2
status: erledigt
effort: M
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed: 2026-11-24
milestone:
branch: feature/w-0049-hub-als-einstieg-zweites
tags: [board, hub]
blocked_by: [W-0041]
blocks: []
related: [W-0057]
source: manuell
incomplete: false
---

# Hub als Einstieg: zweites Board startet nicht selbst, Port erst beim Klick im Hub

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24, Verhalten von ihm bestätigt (Skizze: Projekt A läuft auf :4747; works board in Projekt B startet keinen Server für B, der Tab zeigt den Hub :4747/hub; im Hub A läuft [Öffnen], B gestoppt [Öffnen startet B auf :4748], C gestoppt [Öffnen]). Läuft schon ein Board und wird eines für ein anderes Projekt gestartet (works board --serve, Sitzungsstart, works start), startet works für dieses Projekt keinen zweiten Server und öffnet keinen neuen Tab, sondern zeigt den Hub des laufenden Boards. Der Hub zeigt alle bekannten Projekte, laufende und gestoppte. Ein Klick auf ein gestopptes Projekt startet dessen Board auf einem freien Port und öffnet es; ein laufendes öffnet sich direkt. Wartet auf W-0041, weil das Hub, Board und Server-Code gerade umschreibt.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Zweites Board startet keinen eigenen Server, der Tab zeigt den Hub
- [x] Der Hub zeigt laufende und gestoppte Projekte; Öffnen startet ein gestopptes Board auf einem freien Port und öffnet es
- [x] Ein laufendes Board öffnet sich aus dem Hub direkt, ohne zweiten Server
- [x] Sitzungsstart, works start und works board --serve verhalten sich gleich; Claude bekommt die Adresse des Hubs genannt
- [x] Selbsttest deckt beide Fälle ab, in beiden Sprachen (nach W-0041)

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [x] Bestand lesen: Board-Start in works.mjs (cmdBoard --serve), server-control.mjs, Hub in hub.mjs (Seite /hub, hubAction start/stop/restart, Tab-Zählung /tabs, Wechsel zum Hub aus W-0025/W-0032), Sitzungsstart-Hook und works start
- [x] Test zuerst (Selbsttest, feste Ports ab 48200): Board A läuft; works board --serve in Projekt B startet keinen Server für B und nennt die Hub-Adresse von A; Hub listet A (läuft) und B (gestoppt); Öffnen bei B startet B auf einem freien Port und liefert dessen Adresse; Öffnen bei A ohne zweiten Server
- [x] Start eines Boards: läuft schon ein Board eines anderen Projekts, keinen Server starten, Hub-Adresse ausgeben, mit --open den Hub zeigen (offener works-Tab wechselt zum Hub, sonst neuer Tab mit dem Hub); gilt für works board --serve, works start und den Sitzungsstart
- [x] Hub: laufende und gestoppte Projekte (nur Ordner mit .works), Öffnen startet ein gestopptes über hubAction start (freier Port, zuletzt genutzter bevorzugt) und leitet dorthin weiter
- [x] Verhalten aus W-0032 (Hub nur bei mindestens zwei laufenden Boards, springt bei einem zurück) an die Antwort des Nutzers anpassen
- [x] Doku (board.md, cli.md, hooks.md in beiden Sprachen), Selbsttest in beiden Sprachen grün

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Abgeschlossen am 2026-11-24. Keine offene Übergabe.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Beziehung: blocked-by W-0041
- 2026-11-24: decisions.md angelegt
- 2026-11-24: Entscheidung E1 dokumentiert: Hub springt bei einem laufenden Board zurück wie bisher
- 2026-11-24: Gestartet (Status: backlog → in-arbeit)
- 2026-11-24: Umsetzungsplan: "Bestand lesen: Board-Start in works.mjs (cmdBoard --serve), server-control.mjs, Hub in hub.mjs (Seite /hub, hubAction start/stop/restart, Tab-Zählung /tabs, Wechsel zum Hub aus W-0025/W-0032), Sitzungsstart-Hook und works start" abgehakt
- 2026-11-24: Umsetzungsplan: "Test zuerst (Selbsttest, feste Ports ab 48200): Board A läuft; works board --serve in Projekt B startet keinen Server für B und nennt die Hub-Adresse von A; Hub listet A (läuft) und B (gestoppt); Öffnen bei B startet B auf einem freien Port und liefert dessen Adresse; Öffnen bei A ohne zweiten Server" abgehakt
- 2026-11-24: Umsetzungsplan: "Start eines Boards: läuft schon ein Board eines anderen Projekts, keinen Server starten, Hub-Adresse ausgeben, mit --open den Hub zeigen (offener works-Tab wechselt zum Hub, sonst neuer Tab mit dem Hub); gilt für works board --serve, works start und den Sitzungsstart" abgehakt
- 2026-11-24: Umsetzungsplan: "Hub: laufende und gestoppte Projekte (nur Ordner mit .works), Öffnen startet ein gestopptes über hubAction start (freier Port, zuletzt genutzter bevorzugt) und leitet dorthin weiter" abgehakt
- 2026-11-24: Umsetzungsplan: "Verhalten aus W-0032 (Hub nur bei mindestens zwei laufenden Boards, springt bei einem zurück) an die Antwort des Nutzers anpassen" abgehakt
- 2026-11-24: Umgesetzt: zweites works board --serve nennt den Hub des laufenden Boards (mit --open wechselt der offene Tab per Ereignis hub, sonst neuer Tab), Hub zeigt gestoppte Projekte mit Board öffnen (startet mit --no-hub, wartet auf die Adresse), Hub springt nur beim Übergang von zwei auf ein Board zurück (E1). works start startet kein Board und der Sitzungsstart nur über works board, beides ist damit abgedeckt. startDetached gibt --no-hub mit, sonst zeigte der Hintergrundprozess selbst den Hub.
- 2026-11-24: Umsetzungsplan: "Doku (board.md, cli.md, hooks.md in beiden Sprachen), Selbsttest in beiden Sprachen grün" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Zweites Board startet keinen eigenen Server, der Tab zeigt den Hub" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Der Hub zeigt laufende und gestoppte Projekte; Öffnen startet ein gestopptes Board auf einem freien Port und öffnet es" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Ein laufendes Board öffnet sich aus dem Hub direkt, ohne zweiten Server" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Sitzungsstart, works start und works board --serve verhalten sich gleich; Claude bekommt die Adresse des Hubs genannt" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Selbsttest deckt beide Fälle ab, in beiden Sprachen (nach W-0041)" abgehakt
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
- 2026-11-25: Beziehung: W-0057 related
