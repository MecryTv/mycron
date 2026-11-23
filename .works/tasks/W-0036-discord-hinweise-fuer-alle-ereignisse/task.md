---
id: W-0036
title: "Discord-Bot works: Verbindung, Statuspost und Nachrichten"
type: feature
priority: P2
status: backlog
effort: XL
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch:
tags: [ui, discord, notifications]
blocked_by: []
blocks: [W-0037, W-0038]
related: []
source: manuell
incomplete: false
---

# Discord: Hinweise für alle Ereignisse per Webhook

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-22/23 (P2): Discord-Anbindung für alles, nicht nur den Wochenbericht. Entscheidung nach Abwägung (Nutzer: überleg, was Sinn macht): Webhook für alle Ereignisse, kein Bot. Ziel: Hinweise aufs Handy, wenn der Nutzer nicht am Rechner ist (der Browser-Hinweis aus W-0028 kommt nur bei offenem Hub-Tab). Grundlage existiert: works report --webhook, URL lokal in .works/report.local.json, Prüfung der URL, sendDiscord für den Wochenbericht. Ereignisse, alle standardmäßig an und einzeln abschaltbar: Claude braucht dich (Freigabe wartet, Claude fertig und wartet, Frage von Claude; mit @-Erwähnung), Ergebnisse (Aufgabe im Review, erledigt, ship gepusht), CI (rot mit Bug-ID aus W-0027, grün nach ship), Planung und Berichte (neue P1, Blockade aufgelöst, Warteschlange leer, Feierabend- und Wochenbericht). Umsetzung: zentrale Funktion, aufgerufen aus Hooks, CLI, ship und ci-watch, damit es ohne offenes Board klappt; Senden im Hintergrund, Hooks bleiben schnell; Bündeln, Discord-Limit 30 pro Minute je Webhook beachten; Webhook je Projekt oder global für alle Projekte, Projektname in jeder Nachricht; Befehle aus Freigaben standardmäßig nicht mitschicken (können Geheimnisse enthalten); Links auf GitHub statt auf das lokale Board; URL nur lokal, im Board maskiert. Gestaltung über Entwürfe: Aussehen der Nachrichten und Einstellungen im Board, Wahl abwarten.


Änderung des Nutzers am 2026-11-23: Eigener Discord-Bot „works“ statt Webhook („cooler und besser, mehr Freiheiten“). Nachrichten als Mischung aus Entwurf B (ausführlich mit Feldern) und C (Statuspost je Projekt plus Pings), Einstellungen nach Entwurf D, aber komplett verbessert. Aufgeteilt: diese Aufgabe Bot, Verbindung und Nachrichten; W-0037 Befehle und Knöpfe; W-0038 Einstellungen im Board. Den Bot legt der Nutzer im Discord-Entwicklerportal an (Token, Einladung auf den Server); Freigaben aus Claude Code erteilt auch der Bot nicht.
## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] works discord richtet den Bot ein (Token, Server, Kanal) und speichert den Token nur lokal (nicht im Git, Datei nur für den Nutzer lesbar), nie in Logs oder URLs
- [ ] Ein Bot-Prozess je Rechner verbindet sich mit Discord (Node 22 oder neuer), startet mit dem Board und läuft für alle Projekte; ohne Einrichtung startet nichts
- [ ] Je Projekt gibt es einen angehefteten Statuspost, den der Bot bei Änderungen bearbeitet (gebündelt, Limits von Discord eingehalten)
- [ ] Ereignisse der vier Gruppen kommen als eigene Nachrichten mit Feldern; bei „Claude braucht dich“ mit Erwähnung des Nutzers
- [ ] Hooks und CLI bleiben schnell; läuft der Bot nicht, geht nichts verloren und es hängt nichts
- [ ] Befehle aus Freigaben gehen nur mit eigenem Schalter mit
- [ ] Tests ohne echtes Discord (nachgebaute API und Gateway)

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] 

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: decisions.md angelegt
- 2026-11-23: Entwurf A „Nachrichten kompakt“ angehängt
- 2026-11-23: Entwurf B „Nachrichten ausführlich“ angehängt
- 2026-11-23: Entwurf C „Statuspost und Pings“ angehängt
- 2026-11-23: Entwurf D „Einstellungen: eigener Abschnitt“ angehängt
- 2026-11-23: Entwurf E „Einstellungen: Tabelle Browser und Discord“ angehängt
- 2026-11-23: title: Discord: Hinweise für alle Ereignisse per Webhook → Discord-Bot works: Verbindung, Statuspost und Nachrichten; effort: L → XL
- 2026-11-23: Entscheidung E1 dokumentiert: Eigener Bot statt Webhook
- 2026-11-23: Entwurf F „Statuspost und Nachrichten mit Knöpfen“ angehängt
- 2026-11-23: Entwurf G „Statuspost mit Thread“ angehängt
