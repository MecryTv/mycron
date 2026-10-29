# Zusammenspiel mit anderen Skills und Werkzeugen

Jede Integration ist optional. Ist ein Skill nicht installiert, den Schritt auslassen oder von Hand erledigen.

## Superpowers: Brainstorming

Der Brainstorming-Skill erarbeitet mit dem Nutzer ein Design und schreibt das Ergebnis in ein eigenes Dokument (je nach Version unter `docs/superpowers/specs/` oder `docs/plans/`). works übernimmt dieses Dokument, statt den Skill umzubauen. So bricht nichts, wenn Superpowers aktualisiert wird.

Ablauf:

1. Vor dem Brainstorming die zugehörige Aufgabe anlegen oder auswählen und dem Brainstorming-Skill die Aufgaben-ID und den Inhalt von Ziel und Kontext mitgeben.
2. Brainstorming wie gewohnt durchführen.
3. Danach das erzeugte Dokument anhängen:
   ```
   works attach-doc W-0012 docs/superpowers/specs/2026-10-29-login-design.md --label "Brainstorm Login"
   ```
   Der Modus kommt aus `config.json` unter `brainstorm.mode`:
   - `link` (Standard): Das Dokument bleibt, wo es ist, decisions.md verlinkt es.
   - `copy`: Kopie nach `tasks/<ID>/docs/`, das Original bleibt.
   - `move`: Verschieben nach `tasks/<ID>/docs/`. Alles liegt an einem Ort, der Docs-Ordner des Projekts bleibt sauber.
   Mit `--mode` lässt sich das pro Aufruf überschreiben.
4. In `decisions.md` den Abschnitt "Brainstorm-Zusammenfassung" in eigenen Worten füllen und jede getroffene Entscheidung als E-Block mit verworfenen Alternativen eintragen (`works decisions <ID> --add ...` oder per Edit).
5. Akzeptanzkriterien und Umsetzungsplan der task.md aus dem Ergebnis ableiten.
6. Ergibt das Brainstorming mehrere unabhängige Arbeitspakete, für jedes eine eigene Aufgabe anlegen und mit `blocked_by` oder `related` verknüpfen.

Erzeugt Superpowers zusätzlich einen Implementierungsplan, diesen ebenfalls anhängen und die Schritte in den Umsetzungsplan übernehmen.

## UI UX Pro Max

Der Skill liefert Empfehlungen zu Stil, Farbpalette, Typografie, Komponenten und UX-Regeln, je nach Version auch eine gespeicherte Design-System-Datei.

Ablauf:

1. Bei UI-Aufgaben (Typ design oder Tag ui) vor der Umsetzung UI UX Pro Max mit Produktart, Zielgruppe und Stilwunsch aus der Aufgabe befragen.
2. Die Empfehlungen in `decisions.md` unter "UI und UX" übertragen:
   - Stil: gewählte Richtung und Begründung
   - Farbpalette: Tabelle mit Rolle, Wert und Verwendung
   - Typografie: Schriften, Größen, Gewichte
   - Layout und Abstände, Komponenten, Barrierefreiheit
   - Verworfene Varianten: alle vorgeschlagenen, aber nicht gewählten Richtungen mit Grund
3. Jede bewusste Wahl zusätzlich als E-Block mit `--source "UI UX Pro Max"` festhalten.
4. Schreibt der Skill eine eigene Datei (zum Beispiel ein Design-System-Dokument), diese mit `works attach-doc` verlinken. Gilt das Design-System projektweit, nur verlinken, nicht verschieben.
5. Generierte Mockups oder Vorschaubilder mit `works asset --kind mockup` ablegen.

## git-workflow

- `works start <ID>` schlägt einen Branch nach dem Schema `<präfix>/<id>-<slug>` vor und schreibt ihn ins Frontmatter. Präfixe: feature und design → `feature/`, bug → `fix/` (bei P1 `hotfix/`), refactor und debt → `refactor/`, chore und spike → `chore/`.
- Ist der git-workflow Skill aktiv, legt dieser den Branch an und verwendet dabei genau diesen Namen. Sonst `works start <ID> --git`.
- Commit-Messages enthalten die ID: `fix(W-0007): Rolle nach Captcha vergeben`. Dadurch findet `works commits <ID>` alle zugehörigen Commits.
- Beim Merge über git-workflow anschließend `works done <ID>` ausführen. Umgekehrt gilt: `works done --confirm` erst, wenn der Merge erfolgreich war oder der Nutzer ihn bewusst später machen will.

## code-audit

Steht standardmäßig in der Definition of Done. Vor `works done --confirm` den code-audit Skill auf die Änderungen der Aufgabe anwenden. Funde mit hoher Schwere sind entweder zu beheben oder als neue Aufgabe zu erfassen (`works new --type bug ... --related <ID>`). Bewusst akzeptierte Abkürzungen als technische Schuld (Typ debt) anlegen.

## responsive-website-check

Gilt für Aufgaben mit Tag `ui`. Vor dem Abschluss ausführen. Gefundene Darstellungsfehler entweder direkt beheben oder als Bug mit Screenshot (`--kind fehler`) erfassen.

## second-brain-sync

Meldet `works done`, dass decisions.md Entscheidungen enthält, dem Nutzer anbieten, die wichtigen davon ins Decision Log des Second Brain zu übernehmen. Übertragen werden Entscheidung, Begründung und verworfene Alternativen, nicht der Verlauf.

## GitHub

- Import: `works gh-import` (siehe workflow.md)
- Export: `works gh-export <ID>` legt ein Issue mit Ziel und Akzeptanzkriterien an und vermerkt es im Frontmatter. Nur nach ausdrücklicher Zustimmung, weil es außerhalb des Projekts sichtbar wird.
- Label-Zuordnung in `config.json` unter `github`.

## Playwright und Browser-Werkzeuge

Für Vorher- und Nachher-Screenshots, siehe assets.md.
