---
id: W-0018
title: design add warnt bei lokaler CSS im Entwurf
type: feature
priority: P2
status: in-arbeit
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
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
- [ ] 

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
Stand: 2026-11-21 16:37

Stand: Branch feature/w-0018-design-add-warnung, WIP-Commit mit dem Test im Selbsttest-Schritt 'Entwürfe: design direction, add, choose' (selftest.mjs): Entwurf g.html mit css/app.css, file:///C:/f.woff2 und bild.png muss beim design add eine Warnung 'lokale Dateien' mit diesen Verweisen und dem Hinweis 'entwurf.mjs inline' liefern, https- und data:-Verweise nicht nennen, und trotzdem anhängen. RED bestätigt (heute keine Warnung). Nächster Schritt: in design.mjs eine Funktion localRefs(html) (link/script/img/source href|src und url() ohne https:, data:, blob:, #, //), in works.mjs cmdDesign bei sub==='add' und .html die Warnung ausgeben (höchstens 5 Verweise nennen). Danach Doku in references/cli.md und integrations.md, Selbsttest, Linux, done. Unterbrochen für W-0019 (Design der Liste Heute).

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Übergabe aktualisiert
