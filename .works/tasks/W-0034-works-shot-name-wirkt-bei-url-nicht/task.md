---
id: W-0034
title: works shot --name wirkt bei --url nicht
type: bug
priority: P3
status: in-arbeit
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch: fix/w-0034-works-shot-name-wirkt-bei-url
tags: [shot]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# works shot --name wirkt bei --url nicht

## Zusammenfassung
works shot ignorierte --name; der Dateiname kam immer aus URL, Ansicht oder ID.

## Beschreibung
Gefunden am 2026-11-22 (P3, vom Nutzer gewünscht). works shot --url=... --name=hub-vorher legt die Bilder trotzdem unter einem aus der URL abgeleiteten Namen ab (etwa 127-0-0-1-4741-light-1440.png). Erwartet: --name bestimmt den Dateinamen auch bei --url.

## Reproduktion
1. works shot --url=http://127.0.0.1:4741/ --name=hub-vorher --widths=1440 --themes=light --out=<ordner>
2. Im Ordner liegt 127-0-0-1-4741-light-1440.png statt hub-vorher-light-1440.png. Immer.

## Erwartetes Verhalten
--name bestimmt den Dateinamen: hub-vorher-light-1440.png.

## Tatsächliches Verhalten
Der Name kommt aus der URL: 127-0-0-1-4741-light-1440.png.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
cmdShot hat flags.name nie ausgewertet, die Option war auch nicht dokumentiert.

## Lösung
Nach der Namensbildung überschreibt --name (slugify, 60 Zeichen) den Namen für alle Arten. Doku in cli.md. Regression im Selbsttest (works shot --url mit --name).

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] works shot --url=… --name=x legt x-<schema>-<breite>.png ab

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
