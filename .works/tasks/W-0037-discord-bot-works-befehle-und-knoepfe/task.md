---
id: W-0037
title: "Discord-Bot works: Befehle und Knöpfe"
type: feature
priority: P2
status: in-arbeit
effort: L
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch: feature/w-0037-discord-bot-works-befehle-und
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
- [x] Gemeinsames Modul discord-ui.mjs: Befehlsdefinitionen, Hilfe nach HS, Dialoge (Modals), custom_id-Schema, Sprache nach Discord-Locale
- [x] Fake-Discord: Gilden-Befehle, Knopfdruck, Dialog-Antwort, Bearbeiten der vorläufigen Antwort (Webhook)
- [x] Eigener Bot: Befehle registrieren, INTERACTION_CREATE vom Gateway, nur der Besitzer, sofort vorläufig antworten, dann Ergebnis
- [x] Aktionen über die Board-API (Akteur Discord): Status, Aufgaben, neue Aufgabe, Anweisung, Annehmen, Zurückgeben, Bug ansehen
- [x] Knöpfe an Nachrichten: Review (Annehmen, Zurück an Claude), Fertig (Anweisung an Claude), CI rot (Bug ansehen); nach Erledigung weg
- [ ] Dienst: Hilfe selbst, Befehle und Knöpfe an das gekoppelte Gerät (Inbox mit Long-Poll, Antwort über den Dienst), Dialoge selbst öffnen, Besitzer prüfen, Gerät aus erkennen
- [ ] Gerät im gemeinsamen Modus: Inbox abholen, beantworten
- [ ] Tests: Selbsttest (eigener Bot) und Dienst-Test (gemeinsamer Bot), Doku

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->
- plugins/works/skills/works/scripts/discord-ui.mjs: neu, gemeinsam für Bot und Dienst
- plugins/works/skills/works/scripts/discord-bot.mjs: Interaktionen, Knöpfe, Inbox
- plugins/works/skills/works/scripts/discord-fake.mjs: Interaktionen im Test
- plugins/works/skills/works/scripts/api.mjs: Akteur und Quelle für Aktionen aus Discord
- plugins/works/skills/works/scripts/selftest.mjs: Schritt Befehle und Knöpfe
- services/works-bot/server.mjs, test.mjs, Dockerfile, README.md: Weiterleitung an das Gerät

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->
- Alle Antworten nur für den Aufrufer (ephemeral). Erst vorläufig antworten (Discord verlangt eine Antwort in 3 s, Annehmen kann Prüfungen laufen lassen), dann die vorläufige Antwort bearbeiten.
- Dialoge (Zurück an Claude, Anweisung, Neue Aufgabe) müssen sofort aufgehen: Beim gemeinsamen Bot öffnet sie der Dienst selbst, das Gerät bekommt erst die Antwort aus dem Dialog. Deshalb liegen die Dialoge im gemeinsamen Modul.
- Weiterleitung an das Gerät über eine Inbox mit Long-Poll (das Gerät hat kein Gateway). Das Interaktions-Token bleibt im Dienst, das Gerät antwortet über den Dienst.
- Zuordnung: Knöpfe gehören zu der Nachricht, also zu dem Gerät, das sie geschrieben hat; Befehle zum zuletzt aktiven Gerät im Kanal.
- Aktionen laufen über dieselbe API wie das Board (Rückgängig im Board möglich), Verlaufseinträge mit [Discord].
- Antworttexte deutsch oder englisch nach der Sprache des Discord-Clients; Befehle englisch mit deutscher Übersetzung (HS).
- Der alte Unterbefehl status (gekoppelte Geräte) des Dienstes wird zu /works status für den Projektstand; die Geräte stehen in /works help.

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
- 2026-11-23: Entwurf HS „/works help“ angehängt
- 2026-11-23: Entwurf HS „/works help“ gewählt. Grund: Wahl des Nutzers
- 2026-11-23: Beziehung: W-0044 blocked-by
- 2026-11-23: Beziehung entfernt: blocked-by W-0040
- 2026-11-23: Gestartet (Status: backlog → in-arbeit)
- 2026-11-23: Umsetzungsplan: "Gemeinsames Modul discord-ui.mjs: Befehlsdefinitionen, Hilfe nach HS, Dialoge (Modals), custom_id-Schema, Sprache nach Discord-Locale" abgehakt
- 2026-11-23: Umsetzungsplan: "Fake-Discord: Gilden-Befehle, Knopfdruck, Dialog-Antwort, Bearbeiten der vorläufigen Antwort (Webhook)" abgehakt
- 2026-11-23: Umsetzungsplan: "Eigener Bot: Befehle registrieren, INTERACTION_CREATE vom Gateway, nur der Besitzer, sofort vorläufig antworten, dann Ergebnis" abgehakt
- 2026-11-23: Umsetzungsplan: "Aktionen über die Board-API (Akteur Discord): Status, Aufgaben, neue Aufgabe, Anweisung, Annehmen, Zurückgeben, Bug ansehen" abgehakt
- 2026-11-23: Umsetzungsplan: "Knöpfe an Nachrichten: Review (Annehmen, Zurück an Claude), Fertig (Anweisung an Claude), CI rot (Bug ansehen); nach Erledigung weg" abgehakt
- 2026-11-23: Entscheidung E1 dokumentiert: Erst vorläufig antworten, dann das Ergebnis
- 2026-11-23: Entscheidung E2 dokumentiert: Dialoge im gemeinsamen Modul, beim gemeinsamen Bot öffnet sie der Dienst
- 2026-11-23: Entscheidung E3 dokumentiert: Inbox mit Long-Poll für das Gerät
- 2026-11-23: Entscheidung E4 dokumentiert: Aktionen über die Board-API
