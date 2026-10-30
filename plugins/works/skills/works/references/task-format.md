# Aufgabenformat

## Ordner einer Aufgabe

```
.works/tasks/W-0012-login-seite-ueberarbeiten/
  task.md        Frontmatter und Inhalt der Aufgabe
  decisions.md   Designentscheidungen (bei Typ design automatisch, sonst über works decisions)
  assets/        Bilder und Dateien, gepflegt über works asset
  docs/          kopierte oder verschobene Dokumente, etwa Brainstorm-Ergebnisse
```

Der Ordnername entsteht beim Anlegen aus ID und Titel. Eine spätere Titeländerung benennt den Ordner nicht um, die ID bleibt die Referenz.

## Frontmatter

Wird ausschließlich über das CLI geschrieben (`works new`, `works set`, `works link` und andere).

| Feld | Werte | Bedeutung |
|---|---|---|
| id | `W-0012` | Eindeutige ID, Präfix in config.json |
| title | Text | Kurz und konkret, beschreibt das Ergebnis |
| type | feature, bug, refactor, spike, chore, design, debt | Bestimmt Vorlage und DoD-Prüfungen |
| priority | P1 bis P4 | Siehe priorities.md |
| status | backlog, geplant, in-arbeit, review, erledigt, verworfen | Siehe priorities.md |
| effort | S, M, L, XL | Aufwandsschätzung |
| risk | niedrig, mittel, hoch | Risikoeinschätzung |
| created | Datum | Anlagedatum |
| updated | Datum | Letzte Änderung über das CLI |
| due | Datum | Optionale Frist |
| completed | Datum | Abschluss- oder Verwerfungsdatum |
| milestone | `M1` | Zugehöriger Meilenstein aus config.json |
| branch | Text | Vorgeschlagener oder genutzter Git-Branch |
| tags | Liste | Freie Schlagwörter. `ui` aktiviert zusätzliche DoD-Prüfungen, `intern` blendet die Aufgabe im Changelog aus |
| blocked_by | Liste von IDs | Muss vorher erledigt sein |
| blocks | Liste von IDs | Wartet auf diese Aufgabe (wird gegenseitig gepflegt) |
| related | Liste von IDs | Inhaltlich verwandt |
| source | Text | Herkunft: `manuell`, `todo:datei#hash`, `github#12`, `idee:I-003`, `stacktrace` |
| incomplete | true, false | Schnell erfasst, Details fehlen noch |
| reopened | Zahl | Wie oft wiedereröffnet |
| issue | Text | Verknüpftes GitHub Issue nach `works gh-export` |

## Abschnitte je Typ

Alle Typen haben am Ende: Assets, Offene Fragen, Übergabe, Verlauf.

| Typ | Abschnitte davor |
|---|---|
| feature | Ziel, Kontext und Problem, Nutzerperspektive, Akzeptanzkriterien, Umsetzungsplan, Betroffene Dateien, Designentscheidungen |
| bug | Zusammenfassung, Reproduktion, Erwartetes Verhalten, Tatsächliches Verhalten, Umgebung, Logs und Fehlermeldungen, Ursache, Lösung, Akzeptanzkriterien, Betroffene Dateien |
| refactor | Ziel, Ist-Zustand, Zielarchitektur, Motivation, Risiken, Rollback, Umsetzungsplan, Akzeptanzkriterien, Betroffene Dateien, Designentscheidungen |
| spike | Forschungsfrage, Zeitlimit, Hypothesen, Vorgehen, Ergebnisse, Empfehlung, Folgeaufgaben, Akzeptanzkriterien |
| chore | Beschreibung, Checkliste, Akzeptanzkriterien, Betroffene Dateien |
| design | Ziel, Zielgruppe und Kontext, Referenzen, Varianten, Gewählte Lösung, Akzeptanzkriterien, Umsetzungsplan, Betroffene Dateien, Designentscheidungen |
| debt | Abkürzung, Grund, Folgekosten und Risiko, Auslöser, Rückzahlung, Akzeptanzkriterien, Betroffene Dateien |

Die Vorlagen liegen in `templates/`. Platzhalterkommentare (`<!-- ... -->`) beim Ausfüllen durch Inhalt ersetzen. Leere Abschnitte dürfen bestehen bleiben, Abschnittsüberschriften nicht umbenennen, weil das CLI sie für Prüfungen liest. Zusätzliche Abschnitte sind erlaubt (zum Beispiel `## Herkunft` bei importierten Aufgaben oder `## Commits` nach `works commits --write`).

## Abschnitt Beschreibung

Die zentrale Stelle jeder Aufgabe: was passieren soll, warum, Hintergrund, Details, Links und Hinweise des Nutzers. Im Board-Dialog "Neue Aufgabe" gibt es dafür nur dieses eine Textfeld, im CLI `works new --description "..."`. Der Abschnitt steht direkt unter dem Hauptabschnitt der Vorlage (Ziel, Zusammenfassung und so weiter), bei Chores ist er selbst der Hauptabschnitt. Das Detailpanel zeigt ihn als ersten Abschnitt; ein Ziel nur, wenn es gefüllt ist. Claude liest die Beschreibung vor der Arbeit zuerst und behandelt sie als Vorgabe.

## Schreibregeln für Inhalte

- Ziel: Ein bis drei Sätze, die das Ergebnis beschreiben, nicht die Tätigkeit. Gut: "Neue Accounts erhalten nach der Verifizierung zuverlässig die Rolle Mitglied." Schlecht: "Verifizierung fixen."
- Akzeptanzkriterien: Je Zeile eine prüfbare Aussage als Checkbox. Messbar, wo möglich ("Seite lädt unter 1,5 s auf 4G").
- Umsetzungsplan: Kleine Schritte als Checkboxen. Unteraufgaben gehören hierher. Nur wenn ein Teil eigenständig priorisiert oder von jemand anderem erledigt wird, eine eigene Aufgabe anlegen und verknüpfen.
- Betroffene Dateien: Pfade mit kurzer Notiz, zum Beispiel `src/commands/verify.ts: Rollenvergabe nach Captcha`.
- Offene Fragen: `- [ ] Frage` über `works question`. Nach Klärung mit `works question <ID> --resolve <Nr> --answer "..."` abhaken, die Antwort fließt in den passenden Abschnitt ein.
- Übergabe: Siehe workflow.md. Wird überschrieben, nicht ergänzt.
- Verlauf: Nur über das CLI (`works log`). Format `- JJJJ-MM-TT: Text`. Hält Entscheidungen, Statuswechsel und wichtige Zwischenstände fest, kein Tagebuch jeder Kleinigkeit.

## decisions.md

Aufbau:

- Quellen: Links auf Brainstorm-Dokumente, UI UX Pro Max Ausgaben, Referenzen
- Brainstorm-Zusammenfassung: Problemverständnis, betrachtete Ansätze, Ergebnis in eigenen Worten
- Entscheidungen: nummerierte Blöcke E1, E2 mit Datum, Quelle, Kontext, Entscheidung, Begründung, verworfenen Alternativen samt Grund und Konsequenzen
- UI und UX: Stil, Farbpalette als Tabelle, Typografie, Layout und Abstände, Komponenten, Barrierefreiheit, verworfene Varianten

Verworfene Alternativen sind Pflicht, sobald es welche gab. Gerade das Warum geht sonst als Erstes verloren.

Neue Entscheidung per CLI:

```
works decisions W-0012 --add "Kartenlayout statt Tabelle" \
  --decision "Aufgaben als Karten im Raster" --why "Mobil besser lesbar" \
  --rejected "Tabelle: horizontales Scrollen auf Mobil,Liste: zu wenig Platz für Vorschaubilder" \
  --source "UI UX Pro Max"
```

`--rejected` trennt Alternativen mit Komma.
