# Brainstorming W-0011 bis W-0014

Ein gemeinsamer Entwurf, weil alle vier im Board landen und sich vorhandene Bausteine teilen (Hinweiszeile, Wartet auf dich, Diff-Darstellung, Prüfungsverlauf).

## W-0011 Diff im Verlauf (zu entscheiden: A oder B)
- Gezeigt wird der aktuelle Stand der Datei gegen den letzten Commit, im Worktree der Aufgabe, falls sie parallel läuft. Der einzelne Werkzeugaufruf ist nirgends gespeichert; ihn mitzuschreiben würde jeden Edit in activity.json aufblähen.
- A Aufklappen unter dem Eintrag (höchstens 260 px, dann scrollen), Link zum vorhandenen Reiter Code und Commits.
- B Seitenleiste mit dem ganzen Diff.
- Empfehlung A: kurzer Blick ohne Ansichtswechsel, für große Diffs gibt es den Reiter schon.

## W-0012 Konflikt-Radar und W-0013 Stillstand
- Beide als Hinweis in der vorhandenen Zeile unter der Flussleiste (filtert wie "offen mit P1"), als Etikett an der Karte und als Punkt unter "Wartet auf dich".
- Konflikt: zwei offene Aufgaben mit gemeinsamen Dateien laut files.jsonl. Etikett nennt die andere Aufgabe, Tooltip die Dateien.
- Stillstand: in Arbeit, seit der Schwelle (Standard 3 Tage, config.json) kein Werkzeugaufruf, kein Schritt und kein Verlaufseintrag. Etikett sagt, ob eine Übergabe fehlt.

## W-0014 Prüfungs-Gesundheit
- Abschnitt unter Werkzeuge, Tabelle über alle Aufgaben: Läufe, Anteil rot, Median der Laufzeit (mit Pfeil bei langsamer als sonst), letzte Läufe, wackelig (Regel aus W-0009).
- Sortierungen oft rot, langsam, wackelig; erste 10, Rest aufklappbar; auf dem Handy ohne Läufe und Verlauf.
