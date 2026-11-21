# entwurf

Ein Skill für Gestaltungsaufgaben: Varianten als HTML-Entwurf mit den echten Styles des Projekts bauen, in drei Breiten hell und dunkel fotografieren, auf Fehler prüfen und zur Wahl vorlegen. Mit [works](../works/README.md) hängt er die Entwürfe an die Aufgabe, ohne works bleiben sie als Dateien im Projekt.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install entwurf@mycron
```

Für die Screenshots braucht es Node 18 oder neuer, ein installiertes Chrome (oder Edge) und Playwright. Fehlt Playwright, nennt das Skript den Befehl dafür: `npm install -g playwright`. Browser lädt Playwright dabei keine herunter: das Skript nimmt Chrome, sonst Edge, sonst das Chromium von Playwright. Einen anderen Browser, etwa `/usr/bin/chromium`, setzt `ENTWURF_BROWSER=<Pfad>`.

## Auslöser

„Zeig mir Entwürfe“, „mach zwei Varianten“, „wie könnte das aussehen“, Gestaltungsaufgaben in works, oder Screenshots einer Seite in mehreren Breiten.

## Bestandteile

- `skills/entwurf/vorlage.html`: Entwurfsseite mit Rahmen zum Umschalten von Varianten und hell/dunkel. `?v=B`, `?theme=dark` und `?frame=0` steuern sie auch über die Adresse.
- `skills/entwurf/scripts/entwurf.mjs shots <seite.html> [--variants A,B] [--widths 1440,768,390] [--themes light,dark] [--out ordner]`: ein Screenshot je Variante, Farbschema und Breite. Meldet seitliches Scrollen mit den Elementen, die überstehen, Seitenfehler, Konsolenfehler und Dateien, die nicht geladen wurden. Exit 0 ohne Probleme, 1 mit Problemen, 2 bei falschem Aufruf oder fehlendem Playwright.
- `skills/entwurf/scripts/entwurf.mjs inline <seite.html> [--variant B] [--out datei.html]`: bettet lokales CSS, Schriften und Bilder als `data:` ein und setzt die Startvariante. Nötig für das works-Board, das Entwürfe in einem abgesicherten iframe zeigt.
