# Designentscheidungen: W-0016 Neues Plugin: Entwurf-Werkzeug für Gestaltungsaufgaben

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
### E1: Ein Skript mit shots und inline, dazu eine Vorlage
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Ein Agent ohne Skill baute für zwei Entwürfe einen eigenen Generator, der Zeilenbereiche aus board.css kopiert, und ein eigenes Screenshot-Skript mit zwei Breiten. Das passiert sonst bei jeder Gestaltungsaufgabe neu.
- Entscheidung: `scripts/entwurf.mjs` mit `shots` (Screenshots je Variante, Schema und Breite, Prüfung auf seitliches Scrollen, Seiten- und Konsolenfehler, nicht geladene Dateien) und `inline` (CSS, Schriften, Bilder als data:). `vorlage.html` mit Umschaltrahmen, gesteuert über `?v=`, `?theme=`, `?frame=0`.
- Begründung: Der Ablauf ist jedes Mal gleich, nur Inhalt und Varianten ändern sich.
- Verworfene Alternativen:
  - Zwei Skripte: mehr Dateien ohne Gewinn
  - Chrome direkt mit --headless --screenshot: kein Zugriff auf scrollWidth und Seitenfehler
- Konsequenzen: Playwright muss auffindbar sein (Projekt, NODE_PATH oder global). Ohne Playwright meldet das Skript den Installationsbefehl (Exit 2).

### E2: Einbetten vor dem Anhängen an works
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Das Board zeigt HTML-Entwürfe in einem iframe mit CSP `style-src 'unsafe-inline' https:`. Eine per file:// oder relativ eingebundene Projekt-CSS lädt dort nicht. Geprüft am Entwurf von W-0010: im Board ungestylt.
- Entscheidung: Der Skill bettet je Variante mit `inline --variant X` ein und hängt diese Kopie an. Die Original-Seite mit Link auf die echte CSS bleibt für den Browser.
- Begründung: Die Kopie zeigt im Board die echten Styles, das Original bleibt beim Arbeiten editierbar und aktuell.
- Verworfene Alternativen:
  - Ausschnitte der CSS in den Entwurf kopieren: veraltet mit der nächsten Änderung
  - CSP im Board lockern: öffnet das Board für lokale Dateien
- Konsequenzen: Eingebettete Entwürfe sind größer (Schriften als base64, beim Board rund 150 KB).

### E3: Playwright suchen statt mitliefern
- Datum: 2026-11-21
- Quelle: Analyse
- Kontext: Plugins haben keine node_modules. Playwright liegt je nach Rechner im Projekt, global oder über NODE_PATH.
- Entscheidung: Suche im Projektordner, über NODE_PATH und in `npm root -g`; Browser in der Reihenfolge Chrome, Edge, Chromium.
- Begründung: Kein Download von Browsern, das installierte Chrome reicht.
- Verworfene Alternativen:
  - npx playwright: lädt bei jedem Aufruf ein Paket aus dem Netz
- Konsequenzen: Einmalig `npm install -g playwright`, falls nichts gefunden wird.

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
