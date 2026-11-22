---
id: W-0023
title: Feierabend und Guten Morgen erweitern
type: feature
priority: P4
status: erledigt
effort:
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed: 2026-11-22
milestone:
branch: feature/w-0023-feierabend-und-guten-morgen
tags: [skill, plugin]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Feierabend und Guten Morgen erweitern

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vom Nutzer am 2026-11-22 für später vorgemerkt: die Skills Feierabend und Guten Morgen (Plugin workday, Skills end-of-day und good-morning) erweitern. Was genau dazukommen soll, ist noch offen und wird mit dem Nutzer geklärt.

Am 2026-11-22 mit dem Nutzer festgelegt (alle acht Vorschläge gewählt): Guten Morgen prüft die CI des letzten Pushes (ci-watch), zeigt Entwürfe ohne Wahl als Playwright-Screenshots im Superpowers-Begleiter, nennt Fälliges von heute (überfällig, heute fällig, Meilensteine, wiederkehrende) und bietet Plugin-Updates aus dem Marketplace an. Feierabend nennt nicht gepushte Commits und bietet den Push an (nie ungefragt), nimmt den Verbrauch des Tages (Tokens, Kosten) in die Bilanz, räumt Hintergrundprozesse auf (Test-Server, Superpowers-Begleiter) und speichert den Tagesbericht in .works/reports.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] good-morning: CI des letzten Pushes steht in der Nachricht, rot kommt unter Wartet auf dich und nach vorn
- [x] good-morning: Entwürfe ohne Wahl werden als Screenshots im Superpowers-Begleiter gezeigt
- [x] good-morning: Überfälliges, heute Fälliges, nahe Meilensteine und wiederkehrende Aufgaben von heute werden genannt
- [x] good-morning: verfügbare Plugin-Updates werden angeboten, nicht ungefragt installiert
- [x] end-of-day: nicht gepushte Commits werden genannt und der Push angeboten, nie ungefragt
- [x] end-of-day: Verbrauch des Tages (Tokens, Kosten) steht in der Bilanz (works time --today)
- [x] end-of-day: von Claude gestartete Hintergrundprozesse und Begleiter werden beendet, Prozesse des Nutzers nicht
- [x] end-of-day: Tagesbericht liegt als Datei in .works/reports

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
Abgeschlossen am 2026-11-22. Keine offene Übergabe.

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: incomplete: true → false
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: works time --today ergänzt (Test, Doku). good-morning: CI des letzten Pushes, Fälliges, Plugin-Updates, Entwürfe im Superpowers-Begleiter. end-of-day: Tagesbericht speichern, nicht Gepushtes, Hintergrund aufräumen, Verbrauch heute. README angepasst. works-Selbsttest 26 von 26. Zwei Test-Agenten laufen in Scratch-Kopien (wd-gm, wd-fa).
- 2026-11-22: Übergabe aktualisiert
- 2026-11-22: Test end-of-day mit Agent grün: Tagesbericht gespeichert, Verbrauch heute in der Bilanz, 2 nicht gepushte Commits genannt und als Frage, Begleiter beendet (stale_pid sauber behandelt). Nachgeschärft: Zweige ohne Upstream gegen origin/HEAD vergleichen.
- 2026-11-22: Test good-morning mit Agent: CI (kein Lauf), Fälliges (W-0024 überfällig), Plugin-Vergleich, Screenshots der Entwürfe und Begleiter-Seite beschrieben, drei Fragen. Nachgeschärft: Screenshots mit --out in den content-Ordner des Begleiters statt nach design/ (sonst im Git), Grund bei kein Lauf, Marketplaces ohne Git auslassen. Nachtest läuft.
- 2026-11-22: Übergabe aktualisiert
- 2026-11-22: Nachtest good-morning grün: Screenshots im content-Ordner des Begleiters, design/ unverändert, Grund bei kein Lauf, Marketplaces ohne vergleichbare Version ausgelassen. Präzisiert: nur Hash-Versionen vergleichen.
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Entscheidung E1 dokumentiert: Erweiterungen von Feierabend und Guten Morgen
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
