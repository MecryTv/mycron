---
id: W-0054
title: Tab eines geschlossenen Boards schließt sich, statt zum zweiten Hub zu werden
type: feature
priority: P3
status: in-arbeit
effort:
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed:
milestone:
branch: feature/w-0054-tab-eines-geschlossenen
tags: [board, hub]
blocked_by: []
blocks: []
related: [W-0057]
source: manuell
incomplete: false
---

# Tab eines geschlossenen Boards schließt sich, statt zum zweiten Hub zu werden

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24 (nach W-0049): Schließt sich ein Board (gestoppt, beendet) und ist es noch als Tab offen, soll sich dieser Tab schließen, damit am Ende nicht zwei Hub-Tabs offen sind. Heute wechselt der Tab eines beendeten Boards zum Hub oder zum verbliebenen Board (W-0032, W-0029), während oft schon ein Hub-Tab offen ist. Hinweis für die Umsetzung: Browser erlauben window.close() nur für Tabs, die per Skript geöffnet wurden; für von Hand geöffnete Tabs eine Lösung finden oder mit dem Nutzer klären (etwa: Tab schließt sich, wenn ein anderer works-Tab den Hub schon zeigt, sonst wird er selbst zum Hub).

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Wird ein Board beendet, während sein Tab offen ist und schon ein Hub-Tab offen ist, bleibt am Ende nur ein Hub-Tab

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] Selbsttests zuerst (rot): works board --stop schickt den offenen Tabs vorher event: ended, --restart nicht; im Browser: Tab an Board B, B wird gestoppt, die Karte „… ist beendet“ erscheint, Titel „Beendet · …“, kein Sprung zum Hub, bei 390 px kein seitliches Scrollen
- [ ] Server: works board --stop (auch „Stoppen“ im Hub) kündigt das Ende über POST /api/hub {op:'end'} an, bevor es den Server beendet (unter Windows hart, ohne SIGTERM). Der Server zählt über /tabs der anderen laufenden Boards die offenen Tabs und Hub-Tabs, nennt einen anderen Hub und holt dort ein Einmal-Ticket für den Neustart, dann event: ended an alle Tabs. Ein Neustart (--restart, neue Version, Übergabe) sendet nichts; bricht nur die Verbindung ab, bleibt alles wie bisher (Neuverbinden, verwaister Tab W-0029)
- [ ] Board (Entwurf B): bei ended Verbindung zu, Neuladen gesperrt, kein Sprung zum Hub; window.close() versuchen, ist der Tab danach noch offen, die ruhige Karte über dem grauen, unscharfen Board zeigen: „Hier den Hub öffnen“ nur, wenn ein anderes Board läuft, „<Projekt> wieder starten“ über dessen Hub mit dem Ticket, sonst Hinweis auf works board --serve; Satz zum anderen Tab nur, wenn er stimmt; Strg+W bzw. ⌘W, auf Touch ohne Tastenkürzel; Titel „Beendet · <Projekt>“, graues Favicon
- [ ] Hub: #start=<Ticket> startet das Board und zeigt es im selben Tab; Hub-Seiten zählen unter /tabs zusätzlich als hubs
- [ ] Texte in de.json, Doku board.md in beiden Sprachen

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->
- [x] Vorschlag für den Fall, dass der Browser das Schließen verbietet: statt eines zweiten Hubs eine schlichte Seite „Board beendet“ mit Hinweis und Knopf „Hier den Hub öffnen“. Passt das so, oder soll ich vorher Entwürfe für diese Seite zeigen? Antwort: Nutzer am 2026-11-25: erst Entwürfe der Seite zeigen.

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Priorität: P3 → P3
- 2026-11-25: Beziehung: W-0057 related
- 2026-11-25: Vorgehen ausgearbeitet (Umsetzungsplan) und Frage zum Fall „Browser verbietet das Schließen“ eingetragen; W-0057 ist ausgeliefert, damit entstehen zwei Hub-Tabs nur noch, wenn ein Board-Tab offen bleibt, dessen Board endet.
- 2026-11-25: Frage 1 geklärt: Nutzer am 2026-11-25: erst Entwürfe der Seite zeigen.
- 2026-11-25: Entwurf A „Leiste wie bei verwaisten Tabs“ angehängt
- 2026-11-25: Entwurf B „Ruhige Karte in der Mitte“ angehängt
- 2026-11-25: Entwurf C „Schlichte Seite statt Board“ angehängt
- 2026-11-25: Entwürfe A bis C (Fable 5.2) angehängt; Tab-Titel „Beendet · mycron“ mit grauem Symbol in allen drei. Wartet auf die Wahl des Nutzers.
- 2026-11-25: Entwurf B „Ruhige Karte in der Mitte“ gewählt. Grund: Nutzer am 2026-11-25: Beide B
- 2026-11-25: Priorität: P3 → P3; incomplete: true → false
- 2026-11-25: Parallel gestartet im Worktree W-0054-tab-eines-geschlossenen (Status: backlog → in-arbeit)
- 2026-11-25: Abschnitt Umsetzungsplan aktualisiert
- 2026-11-25: Umsetzungsplan an Entwurf B angepasst. Geprüft: Ein Tab am beendeten Board kann /boards anderer Boards nicht lesen und deren API nicht aufrufen (anderer Port = andere Herkunft, kein CORS, API prüft Origin und Token). Deshalb holt der stoppende Server die Angaben und ein Einmal-Ticket, der Neustart läuft über den Hub des anderen Boards im selben Tab.
