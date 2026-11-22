---
id: W-0024
title: "works: Playwright-Unterstützung mit works shot"
type: feature
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch: feature/w-0024-works-playwright
tags: [works, board, playwright]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# works: Playwright-Unterstützung mit works shot

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers vom 2026-11-22: works soll Playwright-Unterstützung bekommen, damit Claude das Board und die Seiten eines Projekts selbst ansehen kann, wie beim Superpowers-Begleiter. Neuer Befehl works shot: Screenshots einer Board-Ansicht (Board, Live, eine Aufgabe) oder einer beliebigen URL des Projekts, in mehreren Breiten, hell und dunkel, mit installiertem Chrome über Playwright; meldet seitliches Scrollen und Seitenfehler; hängt das Bild auf Wunsch als Vorher oder Nachher an eine Aufgabe. Der works-Skill nutzt das für die Vorher- und Nachher-Screenshots bei UI-Aufgaben, statt sie von Hand zu machen. Ohne Playwright meldet der Befehl, wie es sich installieren lässt.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] works shot macht Screenshots einer Board-Ansicht und einer URL
- [x] works shot <ID> zeigt das Detail einer Aufgabe im Board
- [x] Seitliches Scrollen, Seiten- und Konsolenfehler werden gemeldet (Exit 1)
- [x] Mit --asset hängt works shot die Bilder als Vorher oder Nachher an die Aufgabe
- [x] Ohne Playwright nennt works shot den Installationsbefehl (Exit 2) und lädt keine Browser
- [x] Der works-Skill nutzt works shot für Vorher und Nachher bei UI-Aufgaben

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [x] Test im Selbsttest (Board-Ansicht, Aufgabe mit --asset, URL mit Fehlern)
- [x] shot.mjs und cmdShot
- [x] Doku: SKILL.md, assets.md, integrations.md, cli.md, Hilfe
- [x] Selbsttest mit Browser, CI streng

## Betroffene Dateien
- `plugins/works/skills/works/scripts/shot.mjs`: neu, Playwright laden, Browser starten, Screenshots und Prüfungen
- `plugins/works/skills/works/scripts/works.mjs`: Befehl shot, Hilfe
- `plugins/works/skills/works/scripts/selftest.mjs`: Test für works shot, extraEnv
- `plugins/works/skills/works/SKILL.md`, `references/assets.md`, `integrations.md`, `cli.md`
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Stand: 2026-11-22 18:41

Branch feature/w-0024-works-shot, nicht committet. works shot fertig, Doku fertig, Browser-Selbsttest läuft (TEMP/w24.log). Offen: loadPlaywright in shot.mjs soll zusätzlich vom Skriptordner aus suchen (in der CI liegt playwright im Repo-node_modules, works shot läuft im Testprojekt). Danach Selbsttest, Kriterien abhaken, done, Merge, Push, CI (Board im Browser muss works shot ausführen, nicht überspringen), Plugin-Update.

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: works shot gebaut (shot.mjs, cmdShot): Board-Ansichten über Tasten, Aufgabe über Klick auf die Karte (nur sichtbarer Bereich), --url für beliebige Seiten, Prüfung auf Überlauf und Fehler, --asset hängt an. Handtest gegen das laufende Board grün, ohne Playwright Exit 2. Doku: SKILL.md (Regel 18, Ablauf, Tabelle), assets.md, integrations.md, cli.md, Hilfe. Browser-Selbsttest läuft.
- 2026-11-22: Übergabe aktualisiert
- 2026-11-22: Selbsttest rot: Chrome/Edge stürzen unter Windows ab, wenn USERPROFILE auf einen fremden Ordner zeigt (Selbsttest-Umgebung). works shot im Test bekommt das echte Profil (extraEnv). loadPlaywright sucht zusätzlich vom Skriptordner aus (CI: Playwright im Repo-node_modules). Neuer Lauf läuft.
- 2026-11-22: Browser-Selbsttest 26 von 26, works shot lief (nicht übersprungen). In der CI scheitert der Test, wenn works shot dort kein Playwright findet.
- 2026-11-22: decisions.md angelegt
- 2026-11-22: Entscheidung E1 dokumentiert: works shot statt Abhängigkeit zum Plugin mockups
