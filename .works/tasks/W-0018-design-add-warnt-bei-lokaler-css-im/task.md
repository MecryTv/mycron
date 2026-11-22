---
id: W-0018
title: design add warnt bei lokaler CSS im Entwurf
type: feature
priority: P2
status: erledigt
effort: S
risk:
created: 2026-11-21
updated: 2026-11-22
due:
completed: 2026-11-22
milestone:
branch: feature/w-0018-design-add-warnt-bei-lokaler
tags: [works, board, design-add]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# design add warnt bei lokaler CSS im Entwurf

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Das Board zeigt HTML-Entwürfe in einem iframe mit CSP (style-src 'unsafe-inline' https:, font-src https: data:, img-src data: blob: https:). Lokale Stylesheets, Schriften und Bilder (file:// oder relative Pfade) laden dort nicht, der Entwurf erscheint ungestylt (gesehen an W-0010). works design add soll beim Anhängen eines HTML-Entwurfs warnen, wenn er solche Verweise enthält, und auf das Einbetten hinweisen (Plugin entwurf: entwurf.mjs inline). Wunsch des Nutzers nach W-0016.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
<!-- Prüfbare Aussagen. Jede Zeile muss sich mit ja oder nein beantworten lassen. -->
- [x] design add warnt bei einem HTML-Entwurf mit lokalen Verweisen (relativ oder file://) und nennt sie
- [x] Verweise auf https, data: und blob: lösen keine Warnung aus
- [x] Der Entwurf wird trotz Warnung angehängt
- [x] Die Warnung nennt den Weg zum Einbetten (entwurf.mjs inline)

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [x] Test im Selbsttest-Schritt Entwürfe (RED)
- [x] localRefs in design.mjs, Warnung in cmdDesign
- [x] Doku in references/cli.md und integrations.md
- [x] Selbsttest Windows, Linux und macOS über die CI

## Betroffene Dateien
- `plugins/works/skills/works/scripts/design.mjs`: localRefs
- `plugins/works/skills/works/scripts/works.mjs`: Warnung bei design add
- `plugins/works/skills/works/scripts/selftest.mjs`: Test im Schritt Entwürfe
- `plugins/works/skills/works/references/cli.md`, `integrations.md`
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
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Übergabe aktualisiert
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Entscheidung E1 dokumentiert: Warnen statt automatisch einbetten
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
