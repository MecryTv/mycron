# Bilder und Assets

## Die technische Einschränkung

Ein Bild, das der Nutzer in Claude Code per Einfügen oder Drag and Drop in den Chat gibt, liegt nur im Kontext. Claude kann es ansehen, aber nicht als Datei speichern, weil die Binärdaten nicht zugänglich sind. Deshalb nie behaupten, ein eingefügtes Bild sei gespeichert worden, solange keine Datei kopiert wurde.

Damit ein Bild in `assets/` landet, gibt es drei Wege.

### 1. Dateipfad

Der Nutzer nennt den Pfad oder zieht die Datei ins Terminal, dann steht der Pfad im Prompt. Häufige Orte, nach denen gefragt werden kann: `~/Bilder/Bildschirmfotos/`, `~/Pictures/Screenshots/`, `~/Downloads/`.

```
works asset W-0012 ~/Bilder/Bildschirmfotos/2026-10-29_19-02.png --kind vorher \
  --desc "Login-Seite vor dem Umbau. Formular linksbündig, Logo 24 px, kein Dark Mode, Fehler als Toast oben rechts."
```

Ohne `--move` wird die Datei kopiert, das Original bleibt.

### 2. Inbox

Der Nutzer legt Screenshots in `.works/inbox/` ab, etwa indem er das Screenshot-Tool dorthin speichern lässt. Beim nächsten Aufruf:

```
works inbox
works asset W-0012 bildschirmfoto.png --kind fehler --desc "..."
```

Dateien aus der Inbox werden verschoben, nicht kopiert. Vor der Zuordnung das Bild mit Read ansehen, damit die Beschreibung stimmt, und bei Unklarheit den Nutzer fragen, zu welcher Aufgabe es gehört.

### 3. Selbst erstellte Screenshots

`works shot` macht Screenshots mit dem installierten Chrome über Playwright und hängt sie auf Wunsch gleich an die Aufgabe:

```
works shot --url http://localhost:5173/login --widths 1440,390 --themes light,dark --asset W-0012 --kind vorher --desc "Login vor der Änderung"
works shot live --widths 390 --themes dark        # eine Ansicht des works-Boards
works shot W-0012                                 # das Detail einer Aufgabe im Board
```

1. Vor der ersten Änderung: die Seite mit `--asset <ID> --kind vorher` aufnehmen.
2. Nach der Umsetzung: gleiche Adresse, gleiche Breiten und Farbschemata, `--kind nachher`.
3. Die Bilder mit Read ansehen. `works shot` meldet außerdem seitliches Scrollen, Seiten- und Konsolenfehler und Dateien, die nicht geladen wurden (Exit 1).

Ohne `--asset` landen die Bilder in `.works/.tmp/shots/` (nicht im Git) oder in `--out`. Fehlt Playwright, nennt der Befehl den Installationsbefehl (Exit 2); Browser lädt er keine herunter. Einen anderen Browser setzt `WORKS_BROWSER=<Pfad>`.

## Benennung

Das CLI benennt automatisch: `JJJJ-MM-TT-<slug>[-<art>].<ext>`, bei Kollisionen mit Zähler. Der Slug kommt aus `--name`, sonst aus `--alt`, sonst aus dem ersten Satz von `--desc`.

| `--kind` | Verwendung |
|---|---|
| ist | Aktueller Zustand ohne geplante Änderung |
| vorher | Zustand vor einer Änderung, Gegenstück zu nachher |
| nachher | Ergebnis nach der Änderung |
| referenz | Vorbild, Inspiration, Markenvorgabe |
| mockup | Entwurf, Wireframe, generiertes Design |
| skizze | Handzeichnung, Whiteboard |
| fehler | Fehlerzustand, Fehlermeldung |
| diagramm | Architektur, Ablauf, Datenmodell |

Für die DoD-Prüfung bei UI-Aufgaben zählen Dateien, die auf `-vorher` oder `-ist` und auf `-nachher` enden.

## Beschreibung

Jedes Bild bekommt in der task.md drei Zeilen:

```
![Login-Seite vor dem Umbau](assets/2026-10-29-login-seite-vor-dem-umbau-vorher.png)
Beschreibung: Login-Seite vor dem Umbau. Formular linksbündig, Logo 24 px, kein Dark Mode, Fehler als Toast oben rechts.
Art: vorher · Hinzugefügt: 2026-10-29
```

Die Beschreibung ist so zu schreiben, dass eine spätere Session das Bild nicht öffnen muss, um zu wissen, was zu sehen ist: Layout, auffällige Elemente, Farben, Texte, Fehlermeldungen im Wortlaut. Erst wenn Details fehlen, das Bild mit Read laden. Das spart Kontext.

`works doctor` meldet Bilder ohne Beschreibungszeile, fehlende Dateien und Dateien in `assets/`, auf die nichts verweist.

## Andere Dateien

PDFs, Videos und andere Dateien funktionieren genauso und werden als normaler Link statt als Bild eingebunden.

## Komprimierung

Mit `sharp` als Entwicklungsabhängigkeit im Projekt (`npm i -D sharp`). Im Plugin-Ordner selbst nichts installieren, er wird bei jedem Update ersetzt.

```
works asset <ID> <pfad> --desc "..." --compress
works compress            # alle Aufgaben
works compress W-0012     # eine Aufgabe
```

Breite und Qualität stehen in `config.json` unter `assets`. Mit `assets.compress_on_add: true` wird jedes neue Bild automatisch komprimiert. Ohne sharp wird nichts verändert.

## Git

Bei vielen großen Bildern `works init --gitignore assets` verwenden oder nachträglich `tasks/*/assets/` in `.works/.gitignore` eintragen. Alternativ Git LFS für `*.png` im Ordner `.works/` einrichten.
