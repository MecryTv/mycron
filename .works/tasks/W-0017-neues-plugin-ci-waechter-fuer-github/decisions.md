# Designentscheidungen: W-0017 Neues Plugin: CI-Wächter für GitHub Actions

Angelegt am 2026-11-21. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
<!-- Pro Entscheidung ein Block. Neue Blöcke mit `works decisions <ID> --add "Titel" ...` oder von Hand im gleichen Format:

### E1: Titel
- Datum:
- Quelle: Brainstorm | UI UX Pro Max | Gespräch | Analyse
- Kontext:
- Entscheidung:
- Begründung:
- Verworfene Alternativen:
  - Alternative: Grund
- Konsequenzen:
-->
### E1: Node-Skript statt Anleitung für curl
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Ein Agent ohne Skill kam zum richtigen Ergebnis, brauchte aber acht Runden curl von Hand, spekulierte über die Ursache und bat um einen Token.
- Entscheidung: `scripts/ci-status.mjs` (Node 18+, fetch, keine Abhängigkeiten) übernimmt Abfragen, Warten und Fehlerstellen. Der Skill startet es im Hintergrund und meldet nach Exit-Code.
- Begründung: Feste Abstände und Zeitlimit stehen im Code statt im Ermessen des Agenten. Ohne Token zählt jede Abfrage gegen 60 pro Stunde.
- Verworfene Alternativen:
  - gh run watch: beim Nutzer nicht installiert
  - Monitor mit until-Schleife und curl: jede Session baut die Abfrage neu, Fehlerstelle fehlt
- Konsequenzen: Abhängig von der REST-API von GitHub (actions/runs, jobs, check-runs/annotations).

### E2: Fehlerstelle aus Annotationen, Log-Auszug nur mit Token
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: `/actions/jobs/{id}/logs` antwortet ohne Token mit 403, auch bei öffentlichen Repos.
- Entscheidung: Ohne Token die Fehler-Annotationen des Jobs (`/check-runs/{id}/annotations`), mit Token zusätzlich die Zeilen vor dem ersten `##[error]` im Log. Details für höchstens 5 Jobs.
- Begründung: Annotationen gibt GitHub ohne Anmeldung heraus und sie enthalten `::error`-Meldungen mit Datei und Zeile.
- Verworfene Alternativen:
  - Logs über die HTML-Seite: nicht stabil, kein API-Vertrag
- Konsequenzen: Ohne Token oft nur „Process completed with exit code 1“ plus Schritt und Link.

### E3: Abfrage jede Minute ohne Token, alle 30 Sekunden mit
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Kriterium „höchstens alle 30 Sekunden“, Zeitlimit 20 Minuten. Bei 30 Sekunden ohne Token wären das 40 Abfragen plus Details, zu nah an 60 pro Stunde.
- Entscheidung: Standard 60 Sekunden ohne Token, 30 mit Token, `--interval` nie unter 30. Kein Lauf nach 3 Minuten (`--grace`) wird als „kein Lauf“ gemeldet.
- Begründung: Zwei Läufe hintereinander in einer Stunde bleiben unter dem Limit.
- Verworfene Alternativen:
  - Fest 30 Sekunden: Rate-Limit schon beim zweiten Push
- Konsequenzen: Ohne Token meldet der Wächter bis zu einer Minute später.

### E4: process.exitCode statt process.exit
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Unter Windows brach `process.exit()` nach fetch mit einer libuv-Assertion ab (Exit 127 statt 0 oder 2).
- Entscheidung: Exit-Code über `process.exitCode` setzen und Node normal enden lassen.
- Begründung: Exit-Codes sind die Schnittstelle zum Skill.
- Verworfene Alternativen: keine
- Konsequenzen: keine

## UI und UX
<!-- Nur bei Oberflächen. Leere Unterabschnitte dürfen bleiben. -->

### Stil
<!-- Gewählte Stilrichtung, Stimmung, Begründung. -->

### Farbpalette
| Rolle | Wert | Verwendung |
|---|---|---|
| Primär | | |
| Hintergrund | | |
| Text | | |
| Akzent | | |
| Fehler | | |

### Typografie
<!-- Schriftfamilien, Größenskala, Zeilenhöhen, Gewichte. -->

### Layout und Abstände
<!-- Raster, Breakpoints, Abstandsskala. -->

### Komponenten
<!-- Verwendete oder neue Komponenten und ihre Zustände. -->

### Barrierefreiheit
<!-- Kontraste, Fokuszustände, Tastaturbedienung, Screenreader. -->

### Verworfene Varianten
<!-- Was wurde gezeigt oder erwogen und warum nicht genommen? -->
