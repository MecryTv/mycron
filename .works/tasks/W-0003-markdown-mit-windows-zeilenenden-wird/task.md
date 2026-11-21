---
id: W-0003
title: Markdown mit Windows-Zeilenenden wird nicht erkannt
type: bug
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch: fix/w-0003-markdown-mit-windows
tags: [lib, windows]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Markdown mit Windows-Zeilenenden wird nicht erkannt

## Zusammenfassung
Unter Windows mit core.autocrlf=true ausgecheckte .works-Dateien haben CRLF-Zeilenenden, works erkennt dann keine Abschnitte mehr und meldet in der Definition of Done leere Kriterien.

## Beschreibung
Wird .works/ ins Git genommen und unter Windows mit core.autocrlf=true ausgecheckt (etwa nach Merge, Pull oder Clone), haben task.md, decisions.md, comments.md, ideas.md und wissen.md CRLF-Zeilenenden. works erkennt dann Abschnitte wie Akzeptanzkriterien nicht mehr (sectionRegex endet mit $ vor \r), die Definition of Done meldet leere Kriterien, fehlende Screenshots und fehlende Entscheidungen. Aufgefallen am 2026-11-21 in mycron nach dem Merge von W-0001. Ursache: Die Dateien werden an vielen Stellen direkt mit fs.readFileSync gelesen und ohne Normalisierung geparst. Lösung: ein gemeinsamer Lesezugriff in lib.mjs, der CRLF in LF wandelt, an allen Stellen, die Markdown aus .works lesen. Geschrieben wird weiter mit LF.

## Reproduktion
Häufigkeit: immer.
1. Projekt mit `.works/` im Git unter Windows mit `core.autocrlf=true` (Standard von Git für Windows).
2. Einen Branch mergen oder das Repo neu auschecken, der Änderungen an `.works/` enthält.
3. `works dod <ID>` für eine Aufgabe mit Akzeptanzkriterien ausführen.

## Erwartetes Verhalten
Kriterien, Screenshots und Entscheidungen werden erkannt wie vor dem Auschecken.

## Tatsächliches Verhalten
„Akzeptanzkriterien sind definiert (Abschnitt ist leer)“, „Vorher und Nachher Screenshots: nein“, „decisions.md enthält Entscheidungen“ nicht erfüllt. Auch `works check` findet keine Punkte im Umsetzungsplan mehr.

## Umgebung
works aus main nach dem Merge von W-0001 (bf52375), Windows 10, Git für Windows mit `core.autocrlf=true` aus der Systemkonfiguration.

## Logs und Fehlermeldungen
```
Automatisch geprüft:
  [ ] Akzeptanzkriterien sind definiert (Abschnitt ist leer)
```

## Ursache
`sectionRegex` in lib.mjs sucht Überschriften mit `^## Name$` im Mehrzeilenmodus. Bei CRLF steht vor dem Zeilenende ein `\r`, die Überschrift passt nicht mehr. Die Markdown-Dateien wurden an rund 25 Stellen direkt mit `fs.readFileSync` gelesen und ohne Normalisierung an die Parser gegeben.

## Lösung
Neue Funktion `readText(file)` in lib.mjs, die beim Lesen `\r\n` und `\r` in `\n` wandelt. Alle Stellen, die Markdown aus `.works` lesen (task.md, decisions.md, comments.md, ideas.md, wissen.md, Designdateien, Vorlagen, per `--file` übergebene Texte), nutzen sie. Beim Schreiben entsteht damit wieder reines LF, Git normalisiert beim Commit ohnehin auf LF. Eine `.gitattributes` mit `eol=lf` hätte nur neue Projekte geschützt und bestehende Arbeitskopien nicht repariert.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Mit CRLF-Zeilenenden in task.md erkennt works dod Akzeptanzkriterien, Screenshots und Entscheidungen wie mit LF
- [x] Kommentare, Ideen und Projektwissen mit CRLF werden gelesen
- [x] Nach einer Änderung durch works enthält die task.md keine gemischten Zeilenenden
- [x] Selbsttest prüft eine Aufgabe mit CRLF-Zeilenenden

## Betroffene Dateien
- plugins/works/skills/works/scripts/lib.mjs: `readText`, `loadTask`, Vorlagen
- plugins/works/skills/works/scripts/{api,comments,design,files,knowledge,views,works}.mjs: Lesestellen auf `readText` umgestellt
- plugins/works/skills/works/scripts/selftest.mjs: Schritt „Windows-Zeilenenden (CRLF) in .works“

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: Akzeptanzkriterien: "Kommentare, Ideen und Projektwissen mit CRLF werden gelesen" ergänzt
- 2026-11-21: Akzeptanzkriterien: "Nach einer Änderung durch works enthält die task.md keine gemischten Zeilenenden" ergänzt
- 2026-11-21: Akzeptanzkriterien: "Selbsttest prüft eine Aufgabe mit CRLF-Zeilenenden" ergänzt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Mit CRLF-Zeilenenden in task.md erkennt works dod Akzeptanzkriterien, Screenshots und Entscheidungen wie mit LF" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Kommentare, Ideen und Projektwissen mit CRLF werden gelesen" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Nach einer Änderung durch works enthält die task.md keine gemischten Zeilenenden" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Selbsttest prüft eine Aufgabe mit CRLF-Zeilenenden" abgehakt
- 2026-11-21: readText in lib.mjs, 25 Lesestellen umgestellt; Selbsttest-Schritt CRLF rot ohne, grün mit Korrektur; Windows und Linux-Container 19/19
