---
id: W-0041
title: Alles auf Englisch, Sprache umschaltbar
type: feature
priority: P2
status: backlog
effort: XL
risk:
created: 2026-11-23
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: []
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Alles auf Englisch, Sprache umschaltbar

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-23: Die Skills und alle Infos auf Englisch umschreiben. Zudem soll man die Sprache jederzeit ändern können, wenn man lieber Deutsch oder eine andere Sprache hätte. Umfang: SKILL.md und references aller Plugins (works, workday, ci-watch, mockups), CLI-Ausgaben, Board, Hub und Discord-Nachrichten. Englisch als Standard, Deutsch als zweite Sprache, weitere Sprachen ergänzbar. Vor dem Umbau klären, wie die Umschaltung für Skill-Texte aussieht (englische Doku mit Antwort in der eingestellten Sprache oder eine zweite Fassung der Doku) und ob sie global, je Projekt oder beides gilt.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] CLI, Board, Hub und Discord-Nachrichten sind standardmäßig englisch
- [ ] Die Sprache lässt sich jederzeit umstellen (mindestens Deutsch und Englisch)
- [ ] SKILL.md und references aller vier Plugins sind englisch
- [ ] Claude antwortet in der eingestellten Sprache
- [ ] Selbsttest und Plugin-Tests laufen in beiden Sprachen grün

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
Phasen, je Phase: Test zuerst, umsetzen, Selbsttest der Bereiche grün, committen, `works handoff` mit Stand und nächstem Schritt. Wird der Kontext knapp, nach einer abgeschlossenen Phase aufhören und berichten; eine neue Sitzung macht mit der Übergabe weiter.
- [ ] Phase 1, Kern: scripts/i18n.mjs mit `language(root)` (Reihenfolge: Umgebung WORKS_LANG, dann `language` in .works/config.json des Projekts, dann `language` in ~/.works/settings.json, sonst `en`) und `t(text, vars)` nach gettext-Art: Quelltexte englisch im Code, Katalog scripts/i18n/de.json (englischer Text → deutscher Text, Platzhalter {name}), fehlende Einträge fallen auf Englisch zurück; weitere Sprachen = weitere JSON-Datei. CLI `works lang` (zeigen), `works lang de` (global), `works lang de --project`, `works lang --reset --project`. Test, dass jeder Katalogeintrag dieselben Platzhalter hat wie sein Quelltext.
- [ ] Phase 2, Doku: SKILL.md und references aller vier Plugins (works, workday, ci-watch, mockups) auf Englisch; die bisherigen deutschen Fassungen als zweite Fassung behalten: SKILL.de.md und references/de/ (Inhalt gleich halten). SKILL.md sagt oben: Ist die Sprache Deutsch (`works lang`), SKILL.de.md und references/de/ lesen und auf Deutsch antworten. Skill-Beschreibungen (frontmatter description) englisch.
- [ ] Phase 3, Aufgabenformat: Vorlagen (references/templates, works new) mit Überschriften in der eingestellten Sprache; der Parser (getSection und Verwandte in lib.mjs) kennt beide Sprachen über eine Alias-Tabelle (Beschreibung/Description, Akzeptanzkriterien/Acceptance criteria, Umsetzungsplan/Implementation plan, …), bestehende deutsche Aufgaben bleiben gültig. Status- und Prioritätswerte bleiben als Daten unverändert (in-arbeit, erledigt …), nur die Anzeige wird übersetzt; englische Eingaben (in-progress, done …) als Alias annehmen.
- [ ] Phase 4, CLI und Hooks: alle Ausgaben von works.mjs und den Modulen außer den Discord- und Board-Dateien über t(); Hooks geben Claude die Sprache mit (SessionStart: „Language: de, answer in German, German docs in SKILL.de.md and references/de/“). Selbsttest bekommt WORKS_LANG=de in seiner Umgebung, damit die bestehenden deutschen Prüfungen gelten, plus ein Schritt, der die englische Standardausgabe wichtiger Befehle prüft.
- [ ] Phase 5, Board und Hub (erst nach dem Merge von W-0038 in main, siehe Hinweise): board.js, hub, template über einen Katalog vom Server (gleiche de.json), Sprachwahl im Board (global oder für dieses Projekt).
- [ ] Phase 6, Discord (erst nach dem Merge von W-0038): Texte in discord-bot.mjs, discord.mjs, discord-ui.mjs über t() mit der globalen Sprache; Antworten auf Befehle und Knöpfe folgen weiter der Sprache des Discord-Clients. Dienst services/works-bot bleibt englisch mit deutscher Übersetzung wie bisher.
- [ ] Phase 7, Plugins workday, ci-watch, mockups: Skript-Ausgaben ebenso; Selbsttest und Plugin-Tests in beiden Sprachen grün (einmal WORKS_LANG=de, einmal en für die englischen Prüfungen).

Hinweise für die Umsetzung:
- W-0038 (Discord-Einstellungen im Board) läuft gleichzeitig in einem anderen Worktree und ändert board.js, board.css, serve.mjs, api.mjs, discord*.mjs, die Discord-Teile von works.mjs (cmdDiscord) und selftest.mjs. Diese Stellen in Phase 1 bis 4 nicht anfassen. Vor Phase 5 meldet die Hauptsitzung, dass W-0038 in main ist; dann `git merge main` in diesem Branch, Konflikte lösen, weiter.
- Die Sprache des Nutzers selbst stellt die Hauptsitzung nach dem Merge auf Deutsch, nicht dieser Branch.
- Windows: in Heredocs und node -e gehen Backslashes verloren, Regexe und \n mit dem Edit-Werkzeug schreiben. Git Bash wandelt Argumente wie /works in Pfade um (MSYS_NO_PATHCONV=1 oder PowerShell).
- Kein Board für das echte Projekt starten, nichts im echten Browser öffnen; Browser-Tests nur über den Selbsttest (headless, WORKS_DRY_OPEN).
- Ausgaben, die andere Programme lesen (etwa `Angelegt: W-0012`, das api.mjs mit einem Regex sucht), müssen in beiden Sprachen erkannt werden oder sprachunabhängig sein.

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->
- plugins/works/skills/works/scripts/i18n.mjs, i18n/de.json: neu
- plugins/*/skills/*/SKILL.md, SKILL.de.md, references/, references/de/: Doku in zwei Sprachen
- plugins/works/skills/works/scripts/lib.mjs: Abschnitts- und Status-Aliase
- plugins/works/skills/works/scripts/works.mjs und Module: Ausgaben über t()
- plugins/works/skills/works/hooks/: Sprache für Claude
- plugins/works/skills/works/scripts/board/, hub, discord*.mjs: erst nach W-0038
- plugins/ci-watch, plugins/mockups: Skript-Ausgaben

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
- 2026-11-24: decisions.md angelegt
- 2026-11-24: Entscheidung E1 dokumentiert: Doku in zwei Fassungen, Sprache global mit Ausnahme je Projekt
