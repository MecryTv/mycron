---
id: W-0036
title: "Discord: Hinweise für alle Ereignisse per Webhook"
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
tags: [ui, discord, notifications]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: Hinweise für alle Ereignisse per Webhook

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-22/23 (P2): Discord-Anbindung für alles, nicht nur den Wochenbericht. Entscheidung nach Abwägung (Nutzer: überleg, was Sinn macht): Webhook für alle Ereignisse, kein Bot. Ziel: Hinweise aufs Handy, wenn der Nutzer nicht am Rechner ist (der Browser-Hinweis aus W-0028 kommt nur bei offenem Hub-Tab). Grundlage existiert: works report --webhook, URL lokal in .works/report.local.json, Prüfung der URL, sendDiscord für den Wochenbericht. Ereignisse, alle standardmäßig an und einzeln abschaltbar: Claude braucht dich (Freigabe wartet, Claude fertig und wartet, Frage von Claude; mit @-Erwähnung), Ergebnisse (Aufgabe im Review, erledigt, ship gepusht), CI (rot mit Bug-ID aus W-0027, grün nach ship), Planung und Berichte (neue P1, Blockade aufgelöst, Warteschlange leer, Feierabend- und Wochenbericht). Umsetzung: zentrale Funktion, aufgerufen aus Hooks, CLI, ship und ci-watch, damit es ohne offenes Board klappt; Senden im Hintergrund, Hooks bleiben schnell; Bündeln, Discord-Limit 30 pro Minute je Webhook beachten; Webhook je Projekt oder global für alle Projekte, Projektname in jeder Nachricht; Befehle aus Freigaben standardmäßig nicht mitschicken (können Geheimnisse enthalten); Links auf GitHub statt auf das lokale Board; URL nur lokal, im Board maskiert. Gestaltung über Entwürfe: Aussehen der Nachrichten und Einstellungen im Board, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Alle Ereignisse der vier Gruppen kommen in Discord an, auch ohne offenes Board; jedes ist einzeln abschaltbar
- [ ] Hooks bleiben schnell: Senden läuft im Hintergrund, ein nicht erreichbares Discord verzögert Claude nicht
- [ ] Mehrere Ereignisse kurz hintereinander werden gebündelt, das Limit von Discord (30 je Minute und Webhook) wird eingehalten
- [ ] Die Webhook-URL liegt nur lokal (nicht im Git), erscheint im Board maskiert und nie in Logs; Befehle aus Freigaben gehen nur mit eigenem Schalter mit
- [ ] Ein globaler Webhook gilt für alle Projekte ohne eigenen; jede Nachricht nennt das Projekt
- [ ] Bei „Claude braucht dich“ erwähnt die Nachricht den eingetragenen Discord-Nutzer
- [ ] Der Wochenbericht nutzt denselben Webhook wie bisher
- [ ] Darstellung der Einstellungen auf Mobil, Tablet und Desktop korrekt, Kontraste WCAG AA, per Tastatur bedienbar

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
