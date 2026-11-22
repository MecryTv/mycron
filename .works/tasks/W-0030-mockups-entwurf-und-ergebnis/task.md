---
id: W-0030
title: "mockups: Entwurf und Ergebnis nebeneinander im Review"
type: feature
priority: P3
status: backlog
effort: M
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ui, design, mockups, review]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# mockups: Entwurf und Ergebnis nebeneinander im Review

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (alles einbauen, P3). Beim Review einer Gestaltungsaufgabe soll mockups aus dem gewählten Entwurf (design/, works design choose) und dem Nachher-Screenshot (works shot --asset --kind nachher) ein Vergleichsbild bauen: links Entwurf, rechts Umsetzung, gleiche Breite und gleiches Farbschema. Damit sieht man sofort, wo die Umsetzung abweicht (bei W-0025 etwa die angehobenen Kontraste). Das Bild hängt an der Aufgabe und erscheint im Board bei der Abnahme. Gestaltung des Vergleichs über Entwürfe, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
<!-- Nach Rückfrage am 2026-11-22 verkleinert: Der Abnahmedialog zeigt Entwurf und Ergebnis schon nebeneinander, es fehlt der gleiche Maßstab. -->
- [ ] Im Abnahmedialog gibt es beim Vergleich Entwurf gegen Ergebnis Umschalter für die Breite (Desktop, Tablet, Handy) und für hell/dunkel
- [ ] Der Entwurf rendert in der gewählten Breite und im gewählten Schema; daneben steht das Nachher-Bild mit derselben Breite und demselben Schema, wenn es eins gibt
- [ ] Fehlt ein passendes Nachher-Bild, nennt der Dialog, welches fehlt und wie es entsteht (works shot --asset), statt ein beliebiges zu zeigen
- [ ] Ohne Entwurf oder ohne Nachher-Bild bleibt der Dialog wie heute
- [ ] Darstellung auf Mobil, Tablet und Desktop korrekt, Kontraste WCAG AA, per Tastatur bedienbar

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
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Nach Rückfrage verkleinert: kein separates Vergleichsbild, stattdessen Breite und hell/dunkel im vorhandenen Vergleich des Abnahmedialogs
- 2026-11-22: Entwurf A „Zwei Umschalter“ angehängt
- 2026-11-22: Entwurf B „Vorhandene Bilder“ angehängt
