---
id: W-0010
title: Design-Funde in board.css überarbeiten
type: design
priority: P4
status: backlog
effort: S
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [ui, board, design]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Design-Funde in board.css überarbeiten

## Ziel
<!-- Welches Gestaltungsproblem wird gelöst? -->

## Beschreibung
Angelegt am 2026-11-21 auf Wunsch des Nutzers. Die Design-Prüfung (impeccable detect) meldet in plugins/works/skills/works/scripts/board/board.css sechs Stellen, die älter sind als W-0004 bis W-0009 und bisher bewusst stehen gelassen wurden. Jede Stelle prüfen: neu gestalten oder als gewollt markieren (impeccable ignores), mit Begründung in decisions.md. Am Verhalten des Boards ändert sich nichts. Die Stellen: (1) Zeile 2, Schrift Geist gilt als überall verwendet. (2) Zeile 153, .flow .seg::before, 3px Streifen links an den Abschnitten im Ablauf. (3) Zeile 195, .ms .track span animiert width (Meilenstein-Balken), besser transform: scaleX wie .lv-bar. (4) Zeile 293, .card::before, 3px Streifen links an jeder Karte im Board (trägt vermutlich Status oder Priorität, Bedeutung erhalten). (5) Zeile 431, .feed li mit border-left 3px (Aktivitätsverlauf). (6) Zeile 474, border-left 3px an den Meldungen (Toast). Wo die Farbe eine Bedeutung trägt (Status, Priorität), muss die Information sichtbar bleiben, nur die Form darf sich ändern. Als Gestaltungsaufgabe erst Entwürfe zeigen und die Wahl des Nutzers abwarten.

## Zielgruppe und Kontext
<!-- Wer nutzt die Oberfläche, auf welchen Geräten, in welcher Situation? -->

## Referenzen
<!-- Bestehende Seiten, Vorbilder, Markenvorgaben. Bilder über `works asset --kind referenz`. -->

## Varianten
<!-- Untersuchte Richtungen. Ausführliche Begründungen in decisions.md. -->

## Gewählte Lösung
<!-- Kurzbeschreibung des Ergebnisses. -->

## Akzeptanzkriterien
- [ ] Darstellung ist auf Mobil, Tablet und Desktop korrekt
- [ ] Kontraste erfüllen WCAG AA
- [ ] Bedienung per Tastatur ist möglich
- [ ] Jede der sechs Stellen ist neu gestaltet oder mit Begründung als gewollt markiert
- [ ] impeccable detect meldet für board.css nichts mehr, das nicht bewusst markiert ist
- [ ] Farben mit Bedeutung (Status, Priorität) bleiben erkennbar

## Umsetzungsplan
- [ ] Stellen im Board ansehen, Bedeutung je Streifen klären
- [ ] Entwurf mit Alternativen zeigen, Wahl abwarten
- [ ] Umsetzen oder markieren, Selbsttest mit Browser

## Betroffene Dateien
- plugins/works/skills/works/scripts/board/board.css: Zeilen 2, 153, 195, 293, 431, 474 (Stand 2026-11-21)

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Ist-Zustand mit --kind ist oder vorher, Ergebnis mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
