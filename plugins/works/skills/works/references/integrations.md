# Zusammenspiel mit anderen Skills und Werkzeugen

Jede Integration ist optional. Ist ein Skill nicht installiert, den Schritt auslassen oder von Hand erledigen.

## Gestaltung mit UI UX Pro Max und Superpowers Brainstorming

Bei Gestaltungsaufgaben (Typ design oder Tag ui, design, ux) arbeitet Claude die Entwürfe selbst aus, sobald einer der beiden Skills installiert ist. Der Nutzer muss nicht darum bitten. `works start` sucht unter `~/.claude/skills` und `~/.claude/plugins` nach Ordnern namens `ui-ux-pro-max` und `brainstorm*` und nennt die gefundenen Skills in der Ausgabe.

Alles landet im Aufgabenordner unter `design/`, Index in `design/design.json`. Das Board zeigt es im Tab Entwürfe: Farben und Schrift, die Varianten als Vorschau (HTML-Mockups laufen in einem abgeschotteten iframe), das Brainstorming und die Wahl des Nutzers.

Ablauf:

1. Brainstorming (Superpowers) mit der Aufgaben-ID, der Beschreibung und den Kriterien starten. Fragen an den Nutzer wie gewohnt stellen. Das Ergebnis anhängen:
   ```
   works design brainstorm W-0006 --file docs/superpowers/specs/2026-10-31-bracket-design.md
   ```
2. UI UX Pro Max mit Produktart, Zielgruppe und Stilwunsch aus der Aufgabe befragen. Die Designrichtung anhängen:
   ```
   works design direction W-0006 --file richtung.md --colors "Grund #0F1420,Akzent #3DD6B5,Live #FF5A5F" --fonts "Space Grotesk,Inter"
   ```
   `--file` ist ein Markdown-Text mit Stil, Regeln und Begründung, `--colors` die Palette als `Name #hex` mit Komma getrennt.
3. Zwei bis drei Varianten als eigenständige HTML-Datei (alles inline, keine externen Skripte) oder als Bild bauen und einzeln anhängen:
   ```
   works design add W-0006 --name A --title "Klassisches Bracket" --file /tmp/a.html --note "Alle Runden nebeneinander"
   works design add W-0006 --name B --title "Runden als Tabs" --file /tmp/b.html
   ```
   Namen sind kurz (A, B, C). Die Datei wird als `design/A-klassisches-bracket.html` kopiert.
4. Dem Nutzer sagen, dass die Entwürfe im Board unter Entwürfe liegen, und auf seine Wahl warten. Er wählt im Board mit "Diese nehmen" oder im Gespräch, dann `works design choose W-0006 B --reason "..."`. Die Wahl landet in decisions.md unter "Gewählter Entwurf". Die Sitzungsübersicht meldet Aufgaben mit Entwürfen ohne Wahl.
5. Erst danach umsetzen. Die gewählte Variante ist die Vorgabe. Abweichungen mit dem Nutzer klären.
6. Vor dem Review einen Screenshot des Ergebnisses mit `works asset W-0006 shot.png --kind nachher --desc "..."` ablegen. Das Board stellt ihn in der Abnahme neben den gewählten Entwurf.

Zusätzlich bleiben die bisherigen Wege gültig: Entscheidungen als E-Block in `decisions.md` mit `--source "UI UX Pro Max"`, verworfene Varianten mit Grund. Projektweite Design-Systeme nur mit `works attach-doc` verlinken, nicht in eine Aufgabe kopieren.

Ist keiner der beiden Skills installiert, die Gestaltung wie bisher mit dem Nutzer klären und trotzdem mindestens einen Entwurf mit `works design add` zeigen, wenn es um sichtbare Oberflächen geht.

## Superpowers Brainstorming ohne Gestaltung

Für Brainstormings zu Architektur oder Abläufen das erzeugte Dokument mit `attach-doc` übernehmen, statt den Skill umzubauen:

```
works attach-doc W-0012 docs/superpowers/specs/2026-10-29-login-design.md --label "Brainstorm Login"
```

Der Modus kommt aus `config.json` unter `brainstorm.mode`: `link` (Standard, verlinkt), `copy` (Kopie nach `tasks/<ID>/docs/`) oder `move`. Mit `--mode` pro Aufruf überschreibbar. Danach in `decisions.md` die Brainstorm-Zusammenfassung schreiben, Entscheidungen als E-Block festhalten und Kriterien und Umsetzungsplan ableiten. Ergeben sich mehrere Arbeitspakete, je eine Aufgabe anlegen und verknüpfen. Einen Implementierungsplan von Superpowers ebenfalls anhängen.

## git-workflow

- `works start <ID>` schlägt einen Branch nach dem Schema `<präfix>/<id>-<slug>` vor und schreibt ihn ins Frontmatter. Präfixe: feature und design → `feature/`, bug → `fix/` (bei P1 `hotfix/`), refactor und debt → `refactor/`, chore und spike → `chore/`.
- Ist der git-workflow Skill aktiv, legt dieser den Branch an und verwendet dabei genau diesen Namen. Sonst `works start <ID> --git`.
- Commit-Messages enthalten die ID: `fix(W-0007): Rolle nach Captcha vergeben`. Dadurch findet `works commits <ID>` alle zugehörigen Commits.
- Bei Parallelarbeit legt `works parallel start` die Branches selbst an, jeweils in einem eigenen Worktree. Der git-workflow Skill legt dann keinen weiteren Branch an. Gemergt wird mit `works parallel finish <ID> --merge` (ebenfalls `--no-ff`) oder über einen Pull Request.
- Beim Merge über git-workflow anschließend `works done <ID>` ausführen. Umgekehrt gilt: `works done --confirm` erst, wenn der Merge erfolgreich war oder der Nutzer ihn bewusst später machen will.

## code-audit

Steht standardmäßig in der Definition of Done. Vor `works done --confirm` den code-audit Skill auf die Änderungen der Aufgabe anwenden. Funde mit hoher Schwere sind entweder zu beheben oder als neue Aufgabe zu erfassen (`works new --type bug ... --related <ID>`). Bewusst akzeptierte Abkürzungen als technische Schuld (Typ debt) anlegen.

## responsive-website-check

Gilt für Aufgaben mit Tag `ui`. Vor dem Abschluss ausführen. Gefundene Darstellungsfehler entweder direkt beheben oder als Bug mit Screenshot (`--kind fehler`) erfassen.

## second-brain-sync

Meldet `works done`, dass decisions.md Entscheidungen enthält, dem Nutzer anbieten, die wichtigen davon ins Decision Log des Second Brain zu übernehmen. Übertragen werden Entscheidung, Begründung und verworfene Alternativen, nicht der Verlauf.

## GitHub

Der Abgleich läuft automatisch über das gh CLI, sobald das Projekt ein GitHub-Repository ist und gh angemeldet ist: beim Sitzungsstart im Hintergrund und alle `interval_min` Minuten, solange das Board läuft. Der erste Lauf merkt sich nur den Stand und ändert nichts. Änderungen tragen `[GitHub]` im Verlauf.

| Ereignis | Folge |
|---|---|
| PR mit der ID im Titel oder Branch wird geöffnet | Aufgabe in Arbeit geht nach Review |
| CI eines PR wird grün oder rot | Prüfung `ci` an der Aufgabe, rot blockiert den Abschluss |
| Review mit Änderungswünschen | Text als Kommentar an Claude, Aufgabe zurück nach In Arbeit |
| PR wird gemergt | `works done --confirm` ohne erneute Prüfungen. Ist die Definition of Done offen, bleibt die Aufgabe in Review und bekommt einen Kommentar mit den offenen Punkten |
| Neues Issue nach dem ersten Lauf | Neue Aufgabe, unvollständig markiert, Typ und Priorität aus den Labels |
| Aufgabe aus einem Issue ist erledigt | Issue wird mit Hinweis auf die ID geschlossen |

Befehle: `works github status` zeigt Repository, letzten Lauf und Ereignisse, `works github sync` gleicht sofort ab, `works github set issues=false labels=bug,works` ändert Einstellungen. Im Board unter Werkzeuge, GitHub. Einstellungen in `config.json` unter `github_sync`, siehe config.md.

Weiterhin verfügbar: `works gh-import` für einen einmaligen Import alter Issues und `works gh-export <ID>` (nur nach Zustimmung). Label-Zuordnung in `config.json` unter `github`.

## Playwright und Browser-Werkzeuge

Für Vorher- und Nachher-Screenshots, siehe assets.md.
