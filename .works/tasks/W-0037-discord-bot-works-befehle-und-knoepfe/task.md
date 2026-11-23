---
id: W-0037
title: "Discord-Bot works: Befehle und Knöpfe"
type: feature
priority: P2
status: backlog
effort: L
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch:
tags: [discord, bot]
blocked_by: [W-0036]
blocks: [W-0044]
related: []
source: manuell
incomplete: false
---

# Discord-Bot works: Befehle und Knöpfe

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Teil der Discord-Anbindung (siehe W-0036), Wunsch des Nutzers vom 2026-11-23 (P2). Rückweg vom Handy über den Bot works: Slash-Befehle (etwa /status, /aufgaben, /neu, /anweisung) und Knöpfe an Nachrichten (etwa Review annehmen oder zurückgeben, Anweisung an Claude senden). Nur der eingetragene Discord-Nutzer darf Befehle und Knöpfe nutzen. Anweisungen erreichen Claude beim nächsten Hook; Freigaben aus Claude Code erteilt der Bot nicht. Gestaltung über Entwürfe zusammen mit W-0036.

Wunsch des Nutzers am 2026-11-23 (P2): Dem Bot einen Help-Befehl mit allen wichtigen Infos geben; Nachrichten gern mit Auswahlmenüs (SelectMenus) und Knöpfen („denk dir da was Gutes aus“). Gewählt: Entwurf HS für /works help. Der gemeinsame Bot (W-0040) ist gebaut; Befehle und Knöpfe müssen bei beiden Wegen ankommen (eigener Bot über sein Gateway, gemeinsamer Bot über den Dienst, der sie an das gekoppelte Gerät weiterreicht). Die Grundlage für das Dashboard mit Auswahlmenü aus W-0044.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
<!-- Prüfbare Aussagen. Jede Zeile muss sich mit ja oder nein beantworten lassen. -->
- [ ] /works help zeigt nur dem Aufrufer alle wichtigen Infos (Entwurf HS), englische Namen mit deutscher Übersetzung
- [ ] /works status, tasks (aufgaben), new (neu), instruct (anweisung) funktionieren beim eigenen und beim gemeinsamen Bot
- [ ] Knöpfe an Nachrichten: Review annehmen, Zurück an Claude (mit Begründung), Anweisung an Claude, Bug ansehen
- [ ] Nur der eingetragene Nutzer darf Befehle und Knöpfe nutzen, andere bekommen eine freundliche Absage
- [ ] Beim gemeinsamen Bot antwortet der Dienst sofort (vorläufig) und reicht die Anfrage an genau das gekoppelte Gerät weiter
- [ ] Tests ohne echtes Discord

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] 

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Entwurf H „Befehle und Dialoge“ angehängt
- 2026-11-23: Beziehung: blocked-by W-0040
- 2026-11-23: Entwurf HS „C:/Program Files/Git/works help“ angehängt
- 2026-11-23: Entwurf HS „C:/Program Files/Git/works help“ gewählt. Grund: Wahl des Nutzers
- 2026-11-23: Beziehung: W-0044 blocked-by
- 2026-11-23: Beziehung entfernt: blocked-by W-0040
