# Import aus anderen Werkzeugen und Dateien

`works import` liest Aufgaben aus einer Datei, zeigt eine Vorschau und legt sie erst mit `--apply` an. Im Board unter Werkzeuge, Importieren, mit Vorschau und Auswahl.

## Formate

| Format | Datei | Was erkannt wird |
|---|---|---|
| Trello | JSON-Export eines Boards (Menü, Drucken und Exportieren, JSON) | Karten, Liste als Status, Labels als Tags und Priorität, Fälligkeit, Checklisten als Kriterien (Liste mit "Akzeptanz" oder die erste), weitere Checklisten als Schritte in der Beschreibung. Archivierte Karten nur mit `--include-archived` |
| Notion | CSV-Export einer Datenbank, Markdown-Export oder ZIP mit beidem | Spalten wie bei CSV, Seiteninhalte als Beschreibung, Eigenschaften wie `Status: In progress` im Markdown |
| Linear | CSV-Export | ID, Title, Description, Status, Priority, Estimate, Labels, Due Date |
| CSV, TSV | beliebige Tabelle, auch aus Jira, Asana, GitHub Projects | Trennzeichen automatisch, Spalten über Namen auf Deutsch und Englisch |
| Excel | .xlsx, .xlsm | erste Tabelle oder `--sheet Name`, Datumszellen, sonst wie CSV |
| Word | .docx | Tabellen mit Kopfzeile wie CSV, Aufzählungen und nummerierte Listen als Aufgaben, eingerückte Punkte darunter als Kriterien, Kontrollkästchen (☐ ☒) als offen oder erledigt, Überschriften als Tags oder Status |
| Markdown, Text | .md, .txt | `- [ ]` und `- [x]`, Listenpunkte, `TODO:` Zeilen, eingerückte Punkte als Kriterien, Überschriften als Tags. "Text: Beschreibung" teilt Titel und Beschreibung |
| works | JSON mit einer Liste von Kandidaten | eigene, von Claude bereinigte Liste, siehe unten |

Spalten, die keinem Feld zugeordnet sind, landen als Liste in der Beschreibung, damit nichts verloren geht. Werte werden übersetzt: Status (Done, Doing, In Bearbeitung, To Do …), Priorität (Urgent, Hoch, P1 …), Aufwand (Story Points, Stunden, Tage, S bis XL), Datum (ISO, 31.10.2026, 10/31/2026, Excel-Zahl, "31. Oktober 2026").

## Ablauf für Claude

1. Vorschau: `works import <datei>`. Bei Tabellen zeigt die Ausgabe die Spaltenzuordnung. Stimmt sie nicht, mit `--map title=Aufgabe,status=Liste,description=Notiz` korrigieren. Felder: title, description, status, priority, tags, due, effort, type, key, criteria.
2. Prüfen: Sind die Titel sinnvoll? Stimmen Typ und Priorität grob? Gibt es Einträge, die keine Aufgaben sind (Überschriften, Notizen)? Duplikate sind markiert (`schon importiert`, `ähnlich`, `doppelt in der Datei`) und abgewählt, Erledigtes ebenso.
3. Bei mehr als etwa zehn Einträgen oder unsicherer Zuordnung dem Nutzer die Vorschau kurz zusammenfassen und fragen, ob alles übernommen werden soll, oder auf das Board verweisen, wo er auswählen kann.
4. Anlegen: `works import <datei> --apply [--only 1,4,7 | --skip 3] [--status geplant] [--tags import]`. Mit `--include-done` werden erledigte Einträge als erledigt übernommen.
5. Danach: Aufgaben ohne Beschreibung und Kriterien sind als unvollständig markiert. Nicht alle auf einmal nachfragen, sondern beim Start der jeweiligen Aufgabe.

Aufgaben, die im Quellsystem in Arbeit oder in Review waren, kommen nach Geplant, der Verlauf vermerkt den alten Status. Jede Aufgabe trägt `source: import:<format>:<schlüssel>`. Ein zweiter Import derselben Datei legt deshalb nichts doppelt an.

## Fließtext, Protokolle, E-Mails

Steht in einer Word-Datei oder einem Text keine Liste, sondern Fließtext ("Max kümmert sich bis Freitag um die Sponsorenseite"), erkennt der Import wenig. Dann liest Claude die Datei selbst (bei .docx mit dem docx Skill oder `works import --format md` für die Rohzeilen), schreibt die Aufgaben als JSON und importiert sie:

```json
[
  { "title": "Sponsorenseite bauen", "description": "Aus dem Protokoll vom 30.10.", "priority": "P2", "due": "2026-11-06",
    "tags": ["webseite"], "criteria": [{ "text": "Logos der drei Sponsoren", "done": false }], "type": "feature" }
]
```

```
works import aufgaben.json            Vorschau
works import aufgaben.json --apply
```

So bleiben Duplikatschutz, Vorschau und Verlauf gleich. Erfundene Angaben (Termine, Prioritäten), die nicht im Text stehen, weglassen.
