---
id: W-0040
title: "Gemeinsamer Discord-Bot: zentraler Dienst auf dem VPS"
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
tags: [discord, design]
blocked_by: []
blocks: [W-0037, W-0038]
related: []
source: manuell
incomplete: false
---

# Gemeinsamer Discord-Bot: zentraler Dienst auf dem VPS

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-23: Er stellt den Discord-Bot works für alle bereit, damit niemand einen eigenen Bot anlegen muss. Das Token darf nicht ins Plugin (jeder könnte den Bot übernehmen, Discord sperrt öffentlich gewordene Tokens). Deshalb ein zentraler Dienst auf dem VPS des Nutzers, dort läuft schon Docker mit anderen Projekten. Nutzer laden den gemeinsamen Bot auf ihren Server ein und koppeln works per Code (etwa /verbinden in Discord), ohne Token. works schickt Ereignisse per HTTPS an den Dienst, der postet in Discord; Befehle und Knöpfe (W-0037) laufen zurück zu works. Vorgabe des Nutzers: erst ein Konzept als Entwurf mit Ablauf, Sicherheit (Kopplung, Schlüssel je Server, was über den Dienst läuft, Datenschutz) und Kosten, dazu Entwürfe für Kopplung und Einrichtung; Wahl abwarten, dann bauen. Im Konzept klären, ob der Modus mit eigenem Bot aus W-0036 als Option bleibt.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Konzept mit Ablauf, Sicherheit und Kosten hängt an der Aufgabe,Entwürfe für Kopplung und Einrichtung sind gezeigt und gewählt,Dienst läuft als Docker-Container auf dem VPS mit Anleitung,works koppelt sich per Code ohne Token,Das Bot-Token liegt nur auf dem VPS,Tests ohne echtes Discord und ohne echten VPS

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
- 2026-11-23: Beziehung: W-0037 blocked-by
- 2026-11-23: Beziehung: W-0038 blocked-by
- 2026-11-23: decisions.md angelegt
- 2026-11-23: Dokument verlinkt: konzept.md
- 2026-11-23: Entwurf P „Kopplung: Code aus Discord“ angehängt
- 2026-11-23: Entwurf Q „Kopplung: Code aus works“ angehängt
- 2026-11-23: Entwurf R „Einrichtung: gemeinsam oder eigener Bot“ angehängt
- 2026-11-23: Dokument übernommen: Konzept: gemeinsamer Bot (Ablauf, Sicherheit, Kosten)
- 2026-11-23: Entscheidung E1 dokumentiert: Einrichtung nach Entwurf R
- 2026-11-23: Nutzer hat Entwurf R (Einrichtung: gemeinsam oder eigener Bot) angenommen. Kopplung P oder Q noch offen.
