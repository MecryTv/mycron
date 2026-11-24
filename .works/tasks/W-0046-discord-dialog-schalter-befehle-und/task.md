---
id: W-0046
title: "Discord-Dialog: Schalter Befehle und Knöpfe, Kanal je Projekt"
type: feature
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
tags: [discord]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord-Dialog: Schalter Befehle und Knöpfe, Kanal je Projekt

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Rest aus Entwurf J2 (W-0038), Entscheidung des Nutzers am 2026-11-24: als eigene Aufgabe mit P3 nachziehen. Der Dialog Discord-Bot im Board zeigt nach J2 einen Schalter (Befehle und Knöpfe erlauben) und je Projekt eine Kanalwahl; für beides gibt es noch keine Einstellung. Kanal je Projekt geht nur beim eigenen Bot (der gemeinsame schreibt in genau einen Kanal). Beides als Einstellung in ~/.works/discord/config.json, im Dialog nach J2 und in works discord set; ohne Befehle und Knöpfe registriert der Bot /works nicht und zeigt keine Knöpfe. Dazu aus dem Code-Audit von W-0038 (Nebensache): Die Handy-Vorschau im Dialog nennt nach dem Verschieben noch den alten Kanal. (Text beim Anlegen an den Anführungszeichen abgeschnitten, hier vollständig.)

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Schalter Befehle und Knöpfe im Dialog und als Einstellung, wirkt ohne Neustart
- [ ] Beim eigenen Bot je Projekt ein Kanal im Dialog wählbar; jedes Projekt erscheint im Dashboard seines Kanals
- [ ] Tests ohne echtes Discord, auch ohne globales WebSocket

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] Entwurf J2 aus W-0038 lesen (.works/tasks/W-0038-board-einstellungen-fuer-den-discord-bot/design/J2-j-verbessert.html): wo der Schalter „Befehle und Knöpfe erlauben“ und die Kanalwahl je Projekt stehen; Aussehen danach, Stil wie der bestehende Dialog Discord-Bot in board.js
- [ ] Test zuerst (Selbsttest gegen discord-fake.mjs, API und Browser-Schritt): Schalter aus → keine Knöpfe und kein Auswahlmenü am Dashboard und an neuen Nachrichten, eigener Bot meldet /works für den Server ab (PUT mit leerer Liste), wieder an → registriert; Kanal je Projekt beim eigenen Bot → das Projekt steht im Dashboard seines Kanals, im alten nicht mehr; gemeinsamer Bot → Kanalwahl je Projekt gesperrt mit Hinweis
- [ ] Einstellung `commands` (Standard an) in discord.mjs (DEFAULTS, normalizeConfig, applySetting, `works discord set commands=an|aus`); Kanal je Projekt als `project.<id>.channel=<Kanal-ID>` (projects[rid].channel_id, channelFor nutzt es schon), nur beim eigenen Bot
- [ ] Bot: interactive je Durchgang aus der Konfiguration (ohne Neustart); beim Ausschalten Befehle für den Server abmelden; beim gemeinsamen Bot beantwortet das Gerät Befehle bei ausgeschaltetem Schalter mit einem kurzen Hinweis
- [ ] Dialog: Schalter im Reiter Befehle, Kanalwahl je Projekt im Reiter Projekte (Liste aus /api/discord/channels)
- [ ] Nebensache aus dem Audit von W-0038: Handy-Vorschau nennt nach dem Verschieben den neuen Kanal
- [ ] Doku: integrations.md, board.md, cli.md
- [ ] Selbsttest grün mit und ohne WebSocket, Browser-Schritte, services/works-bot/test.mjs

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
- 2026-11-24: Aufgabe angelegt
