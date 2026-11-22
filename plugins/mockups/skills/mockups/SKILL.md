---
name: mockups
description: Verwenden, wenn für eine Gestaltungsaufgabe Entwürfe, Varianten oder ein HTML-Mockup gezeigt werden sollen, mit den echten Styles des Projekts, hell und dunkel, auf Desktop, Tablet und Handy, oder wenn ein Entwurf an eine works-Aufgabe gehängt wird (works design add). Auch für Screenshots einer Seite in mehreren Breiten und die Prüfung auf seitliches Scrollen.
---

# Entwurf

Zwei Werkzeuge, die bei jeder Gestaltungsaufgabe gleich bleiben:

- `${CLAUDE_SKILL_DIR}/vorlage.html`: Entwurfsseite mit Umschaltrahmen für Varianten und hell/dunkel
- `node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs"`: `shots` macht die Screenshots mit dem installierten Chrome und prüft sie, `inline` bettet CSS, Schriften und Bilder ein

Kein eigenes Screenshot-Skript, kein eigener Generator: Beides gibt es hier schon.

## Ablauf

1. **Grundlage lesen.** Welche CSS-Datei(en) lädt die echte Oberfläche? Wie sieht das Markup des betroffenen Teils im Code aus (Template, Komponente, Render-Funktion)? Mit works zusätzlich die Beschreibung der Aufgabe und frühere Designentscheidungen; die Regeln des works-Skills für Gestaltungsaufgaben gelten weiter.
2. **Entwurfsseite bauen.** `vorlage.html` in den Arbeitsordner kopieren und füllen:
   - Arbeitsordner mit works: im Temp-Verzeichnis (`entwurf-<thema>/`), ins Repo kommt nur die angehängte Kopie. Ohne works: `entwuerfe/<thema>/` im Projekt, nicht committen.
   - Den `<link>` auf die echte CSS-Datei setzen, relativ zum Arbeitsordner oder als `file:///`. Die ganze Datei, nie kopierte Ausschnitte: die veralten mit der nächsten Änderung.
   - Je Variante ein `<section data-ew-variant="A" data-ew-note="...">` mit dem Markup aus dem Code. Zwei bis drei Varianten; „Heute“ als eigene Variante hilft beim Vergleich.
   - Styles einer Variante nur für sie: `html[data-v="B"] .card { ... }`. Eigene Klassen mit Präfix `ew-`.
   - Die Datei mit dem Write-Werkzeug schreiben, nicht über Heredoc, `node -e` oder Template-Strings: Dort gehen `\` und `$` verloren und Regexe brechen still.
3. **Screenshots und Prüfung.**
   ```
   node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs" shots <seite.html> --variants A,B
   ```
   Standard: 1440, 768 und 390 px, je hell und dunkel, Ablage in `<seite>-shots/`. Jede Zeile `PROBLEM` beheben und neu aufnehmen, bis „Alle Screenshots ohne Probleme“ kommt. `nicht geladen: …PROJEKT.css` heißt: Pfad im `<link>` falsch.
   Danach die Bilder selbst ansehen (Read auf die PNG-Dateien): jedes mit Problem und je Variante mindestens 390 dunkel und 1440 hell. Achten auf abgeschnittenen Text, Überlappungen und Kontrast im Dunkeln.
   Exit 2 mit „Playwright fehlt“: dem Nutzer den Befehl aus der Meldung nennen und nicht ungefragt installieren.
4. **Anhängen.**
   - Mit works je Variante einbetten und anhängen:
     ```
     node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs" inline <seite.html> --variant A --out <arbeitsordner>/A.html
     works design add <ID> --name A --title "..." --file <arbeitsordner>/A.html --note "..."
     ```
     Ohne `inline` sieht der Entwurf im Board ungestylt aus: Das Board zeigt ihn in einem iframe, dessen Sicherheitsregeln weder `file://` noch relative Pfade laden.
     Exit 1 mit `nicht eingebettet: …` heißt: Dieser Verweis ließ sich nicht auflösen und bleibt stehen. Jeden prüfen: ein Platzhalter mit Ersatzregel (siehe Fallen) ist harmlos, eine fehlende Datei nicht.
   - Ohne works bleiben Seite und Screenshots im Arbeitsordner.
5. **Zeigen.** Die Original-Seite im Standardbrowser öffnen, Windows `Start-Process "<pfad>"`, macOS `open "<pfad>"`, Linux `xdg-open "<pfad>"`. Mit works zusätzlich auf den Board-Reiter Entwürfe hinweisen. Nachricht: je Variante ein Satz, Pfad der Seite, Ordner der Screenshots, offene Probleme, Frage nach der Wahl.
6. **Auf die Wahl warten** und erst danach umsetzen. Mit works: `works design choose <ID> <Name> --reason "..."`.

## Fallen

| Falle | Gegenmittel |
|---|---|
| Eigene Klasse heißt wie eine im Projekt (`.panel`, `.card`, `.box`) und erbt fremde Styles | Präfix `ew-`, vor neuen Namen im Projekt-CSS suchen |
| Projekt-CSS reagiert nur auf `prefers-color-scheme` | Der Hell/Dunkel-Knopf wirkt dann nicht, die Screenshots stimmen trotzdem (Schema wird emuliert) |
| Entwurf im works-Board ungestylt | `inline` vor `works design add` |
| Projekt-CSS enthält Platzhalter, die erst der Server ersetzt (works-Board: `url("__FONT__")` in `board.css`) | Den `<link>` auf die echte Datei lassen und danach in der Seite eine eigene `@font-face`-Regel mit dem echten Pfad setzen. Keine Kopie der CSS anlegen |
| Webfonts von Google Fonts | Laufen überall, auch im Board; lokale Schriftdateien bettet `inline` ein |
