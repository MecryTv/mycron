---
id: W-0041
title: Alles auf Englisch, Sprache umschaltbar
type: feature
priority: P2
status: in-arbeit
effort: XL
risk:
created: 2026-11-23
updated: 2026-11-24
due:
completed:
milestone:
branch: feature/w-0041-alles-auf-englisch-sprache
tags: []
blocked_by: []
blocks: [W-0049, W-0050]
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
- [x] Die Sprache lässt sich jederzeit umstellen (mindestens Deutsch und Englisch)
- [x] SKILL.md und references aller vier Plugins sind englisch
- [x] Claude antwortet in der eingestellten Sprache
- [ ] Selbsttest und Plugin-Tests laufen in beiden Sprachen grün

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
Phasen, je Phase: Test zuerst, umsetzen, Selbsttest der Bereiche grün, committen, `works handoff` mit Stand und nächstem Schritt. Wird der Kontext knapp, nach einer abgeschlossenen Phase aufhören und berichten; eine neue Sitzung macht mit der Übergabe weiter.
- [x] Phase 1, Kern: scripts/i18n.mjs mit `language(root)` (Reihenfolge: Umgebung WORKS_LANG, dann `language` in .works/config.json des Projekts, dann `language` in ~/.works/settings.json, sonst `en`) und `t(text, vars)` nach gettext-Art: Quelltexte englisch im Code, Katalog scripts/i18n/de.json (englischer Text → deutscher Text, Platzhalter {name}), fehlende Einträge fallen auf Englisch zurück; weitere Sprachen = weitere JSON-Datei. CLI `works lang` (zeigen), `works lang de` (global), `works lang de --project`, `works lang --reset --project`. Test, dass jeder Katalogeintrag dieselben Platzhalter hat wie sein Quelltext.
- [x] Phase 2, Doku: SKILL.md und references aller vier Plugins (works, workday, ci-watch, mockups) auf Englisch; die bisherigen deutschen Fassungen als zweite Fassung behalten: SKILL.de.md und references/de/ (Inhalt gleich halten). SKILL.md sagt oben: Ist die Sprache Deutsch (`works lang`), SKILL.de.md und references/de/ lesen und auf Deutsch antworten. Skill-Beschreibungen (frontmatter description) englisch.
- [x] Phase 3, Aufgabenformat: Vorlagen (references/templates, works new) mit Überschriften in der eingestellten Sprache; der Parser (getSection und Verwandte in lib.mjs) kennt beide Sprachen über eine Alias-Tabelle (Beschreibung/Description, Akzeptanzkriterien/Acceptance criteria, Umsetzungsplan/Implementation plan, …), bestehende deutsche Aufgaben bleiben gültig. Status- und Prioritätswerte bleiben als Daten unverändert (in-arbeit, erledigt …), nur die Anzeige wird übersetzt; englische Eingaben (in-progress, done …) als Alias annehmen.
- [x] Phase 4, CLI und Hooks: alle Ausgaben von works.mjs und den Modulen außer den Discord- und Board-Dateien über t(); Hooks geben Claude die Sprache mit (SessionStart: „Language: de, answer in German, German docs in SKILL.de.md and references/de/“). Selbsttest bekommt WORKS_LANG=de in seiner Umgebung, damit die bestehenden deutschen Prüfungen gelten, plus ein Schritt, der die englische Standardausgabe wichtiger Befehle prüft.
- [ ] Phase 5, Board und Hub (erst nach dem Merge von W-0038 in main, siehe Hinweise): board.js, hub, template über einen Katalog vom Server (gleiche de.json), Sprachwahl im Board (global oder für dieses Projekt).
- [ ] Phase 6, Discord (erst nach dem Merge von W-0038): Texte in discord-bot.mjs, discord.mjs, discord-ui.mjs über t() mit der globalen Sprache; Antworten auf Befehle und Knöpfe folgen weiter der Sprache des Discord-Clients. Dienst services/works-bot bleibt englisch mit deutscher Übersetzung wie bisher.
- [x] Phase 7, Plugins workday, ci-watch, mockups: Skript-Ausgaben ebenso; Selbsttest und Plugin-Tests in beiden Sprachen grün (einmal WORKS_LANG=de, einmal en für die englischen Prüfungen).

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
- [x] Bestehende Projekte haben durch das alte works init "language": "de" in .works/config.json. Das zählt jetzt als Projekt-Einstellung und hat Vorrang vor der globalen Sprache (works lang zeigt das an, works lang --reset --project entfernt es). So lassen oder alte Einträge bei der Migration entfernen, damit nur die globale Einstellung gilt? Antwort: Nutzer am 2026-11-24: Migration entfernt den alten automatisch geschriebenen Eintrag language=de einmalig, dann gilt die globale Sprache.
- [x] Sollen die README.md der Plugins und des Repos auch englisch werden (mit README.de.md), oder bleiben sie deutsch? Sie gehörten nicht zum Plan. Antwort: Nutzer am 2026-11-24: Ja, README.md englisch mit README.de.md daneben (Plugins und Repo).

## Übergabe
Stand: 2026-11-24 19:55

Stand: Phasen 1–4 und 7 fertig, dazu Merge von main (W-0038), Migration für altes language aus works init (Kennzeichen language-1), READMEs englisch mit README.de.md und Phase 5 ohne den Discord-Dialog. Letzte Commits: 0a70bf4 (Merge), 092b688 (Migration, READMEs), c808801 (Board, Hub, Export, API, Sprachwahl). Selbsttest 45/45 grün mit WORKS_LANG=de, mit und ohne WebSocket; services/works-bot/test.mjs, ci-watch- und mockups-Tests grün.

Board: Katalog kommt mit den Boot-Daten (i18n: lang, source, languages, catalog nur mit Board-Texten), meta.lang in den Daten, Neuladen bei Sprachwechsel; Werkzeuge haben die Sprachwahl (global oder nur dieses Projekt) über POST /api/lang. template.html nutzt {{t:…}}, hub.mjs hat einen eigenen kleinen Katalog in window.HUB.t.

Nächster Schritt (nach Nachricht der Hauptsitzung, wenn W-0046 in main ist): git merge main, dann den Dialog Discord-Bot in board.js (Bereich ab '// ---------- Discord-Bot (W-0038)') und board.css übersetzen und Phase 6: discord-bot.mjs, discord.mjs, discord-ui.mjs, discord-api.mjs über tr() mit der globalen Sprache, Antworten auf Befehle und Knöpfe weiter in der Sprache des Discord-Clients (fmtTokens/fmtCost haben dafür einen lang-Parameter). Discord-Teile von serve.mjs, api.mjs und works.mjs (cmdDiscord) ebenso. Der Discord-Bot ruft runActionWithUndo in einem langlebigen Prozess: dort vor Aktionen setLanguage(language(root)) bzw. die Client-Sprache setzen. Danach Kriterien 1 und 5 prüfen, Umsetzungsplan Punkt 5 und 6 abhaken, Status review.
Bekannte Kleinigkeiten: selftest.mjs gibt eigene Zeilen deutsch aus; einige Datumsformate de-DE im CLI (cmdTime, inbox); Demo-Inhalte deutsch; die Sprachwahl im Board hat kein Zurücksetzen der Projekt-Sprache (geht mit works lang --reset --project).

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-24: decisions.md angelegt
- 2026-11-24: Entscheidung E1 dokumentiert: Doku in zwei Fassungen, Sprache global mit Ausnahme je Projekt
- 2026-11-24: Parallel gestartet im Worktree W-0041-alles-auf-englisch (Status: backlog → in-arbeit)
- 2026-11-24: Umsetzungsplan: "Phase 1, Kern: scripts/i18n.mjs mit `language(root)` (Reihenfolge: Umgebung WORKS_LANG, dann `language` in .works/config.json des Projekts, dann `language` in ~/.works/settings.json, sonst `en`) und `t(text, vars)` nach gettext-Art: Quelltexte englisch im Code, Katalog scripts/i18n/de.json (englischer Text → deutscher Text, Platzhalter {name}), fehlende Einträge fallen auf Englisch zurück; weitere Sprachen = weitere JSON-Datei. CLI `works lang` (zeigen), `works lang de` (global), `works lang de --project`, `works lang --reset --project`. Test, dass jeder Katalogeintrag dieselben Platzhalter hat wie sein Quelltext." abgehakt
- 2026-11-24: Phase 1 fertig: scripts/i18n.mjs, i18n/de.json, works lang (global, --project, --reset), Selbsttest-Schritt Sprache
- 2026-11-24: Umsetzungsplan: "Phase 2, Doku: SKILL.md und references aller vier Plugins (works, workday, ci-watch, mockups) auf Englisch; die bisherigen deutschen Fassungen als zweite Fassung behalten: SKILL.de.md und references/de/ (Inhalt gleich halten). SKILL.md sagt oben: Ist die Sprache Deutsch (`works lang`), SKILL.de.md und references/de/ lesen und auf Deutsch antworten. Skill-Beschreibungen (frontmatter description) englisch." abgehakt
- 2026-11-24: Akzeptanzkriterien: "SKILL.md und references aller vier Plugins sind englisch" abgehakt
- 2026-11-24: Phase 2 fertig: SKILL.md und references aller vier Plugins englisch, deutsche Fassung als SKILL.de.md und references/de/, Beschreibungen in plugin.json und marketplace.json englisch
- 2026-11-24: Umsetzungsplan: "Phase 3, Aufgabenformat: Vorlagen (references/templates, works new) mit Überschriften in der eingestellten Sprache; der Parser (getSection und Verwandte in lib.mjs) kennt beide Sprachen über eine Alias-Tabelle (Beschreibung/Description, Akzeptanzkriterien/Acceptance criteria, Umsetzungsplan/Implementation plan, …), bestehende deutsche Aufgaben bleiben gültig. Status- und Prioritätswerte bleiben als Daten unverändert (in-arbeit, erledigt …), nur die Anzeige wird übersetzt; englische Eingaben (in-progress, done …) als Alias annehmen." abgehakt
- 2026-11-24: Phase 3 fertig: Vorlagen in beiden Sprachen, Abschnitts-Aliase in lib.mjs, englische Werte für status/risk/kind; Selbsttest 41/41 grün mit WORKS_LANG=de
- 2026-11-24: Umsetzungsplan: "Phase 4, CLI und Hooks: alle Ausgaben von works.mjs und den Modulen außer den Discord- und Board-Dateien über t(); Hooks geben Claude die Sprache mit (SessionStart: „Language: de, answer in German, German docs in SKILL.de.md and references/de/“). Selbsttest bekommt WORKS_LANG=de in seiner Umgebung, damit die bestehenden deutschen Prüfungen gelten, plus ein Schritt, der die englische Standardausgabe wichtiger Befehle prüft." abgehakt
- 2026-11-24: Akzeptanzkriterien: "Claude antwortet in der eingestellten Sprache" abgehakt
- 2026-11-24: Phase 4 fertig: CLI, Module und Hooks über tr(), Selbsttest 42/42 grün (WORKS_LANG=de, mit und ohne WebSocket). works-bot-Test rot, weil api.mjs nur 'Angelegt:' erkennt (Phase 5)
- 2026-11-24: Umsetzungsplan: "Phase 7, Plugins workday, ci-watch, mockups: Skript-Ausgaben ebenso; Selbsttest und Plugin-Tests in beiden Sprachen grün (einmal WORKS_LANG=de, einmal en für die englischen Prüfungen)." abgehakt
- 2026-11-24: Phase 7 fertig: ci-watch und mockups über tr() mit eigenem Katalog, Plugin-Tests in beiden Sprachen grün; Selbsttest 42/42 grün
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Frage 1 geklärt: Nutzer am 2026-11-24: Migration entfernt den alten automatisch geschriebenen Eintrag language=de einmalig, dann gilt die globale Sprache.
- 2026-11-24: Frage 1 geklärt: Nutzer am 2026-11-24: Ja, README.md englisch mit README.de.md daneben (Plugins und Repo).
- 2026-11-24: Akzeptanzkriterien: "Die Sprache lässt sich jederzeit umstellen (mindestens Deutsch und Englisch)" abgehakt
- 2026-11-24: Merge von main (W-0038), Migration für altes language aus works init, READMEs englisch mit README.de.md, Phase 5 ohne Discord-Dialog: Board, Hub, Export, API, Sprachwahl im Board. Selbsttest 45/45, works-bot- und Plugin-Tests grün
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Beziehung: W-0049 blocked-by
- 2026-11-24: Beziehung: W-0050 blocked-by
