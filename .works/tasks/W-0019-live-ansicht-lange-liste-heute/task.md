---
id: W-0019
title: "Live-Ansicht: lange Liste Heute übersichtlicher"
type: design
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch: feature/w-0019-live-ansicht-lange-liste
tags: [ui, design, board, live]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live-Ansicht: lange Liste Heute übersichtlicher

## Ziel
<!-- Welches Gestaltungsproblem wird gelöst? -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-21 (Screenshot aus dem Board): In der Live-Ansicht zeigt der Bereich Heute alle Aufgaben des Tages als gleich große Einträge mit drei Zeilen (Symbol, ID und Priorität, Titel, Statuszeile). Bei 18 Aufgaben, davon 17 heute erledigt, wird die Spalte sehr lang, die laufende Aufgabe steht oben, der Rest ist eine lange Wand aus 'Heute erledigt'. Die Liste soll besser angezeigt werden: laufende und wartende Aufgaben im Blick, Erledigtes platzsparend. Nutzer: 'kümmer dich um das Design'. Ablauf: Entwürfe mit dem Plugin entwurf zeigen, Wahl des Nutzers abwarten, dann umsetzen. Code: renderLive() und lvStatus() in plugins/works/skills/works/scripts/board/board.js, Styles .lv-run in board.css.

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
- [ ] Bei vielen erledigten Aufgaben bleiben laufende und wartende Aufgaben ohne Scrollen sichtbar
- [ ] Erledigte Aufgaben brauchen deutlich weniger Platz als heute
- [ ] Hell und dunkel, 1440, 768 und 390 px ohne seitliches Scrollen

## Umsetzungsplan
- [ ] 

## Betroffene Dateien

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Ist-Zustand mit --kind ist oder vorher, Ergebnis mit --kind nachher. -->

## Offene Fragen

## Übergabe
Stand: 2026-11-21 16:40

Entwürfe A (Erledigt eingeklappt), B (Erledigt kompakt), C (Gruppen mit Anzahl) hängen an, im Board unter Entwürfe; jede Datei zeigt oben im Rahmen auch 'Heute' zum Vergleich. Screenshots 1440/768/390 hell und dunkel ohne Probleme (entwurf.mjs shots). Nutzer musste los, Design wird später geklärt. Nächster Schritt: Wahl des Nutzers abwarten (works design choose W-0019 <A|B|C>), dann in board.js renderLive() und board.css .lv-run umsetzen (Klassen ew-mini, ew-fold, ew-group ohne ew- übernehmen), Selbsttest mit Browser.

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Entwurf A „Erledigt eingeklappt“ angehängt
- 2026-11-21: Entwurf B „Erledigt kompakt“ angehängt
- 2026-11-21: Entwurf C „Gruppen mit Anzahl“ angehängt
- 2026-11-21: Übergabe aktualisiert
