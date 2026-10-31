# Parallelarbeit mit Agenten

Mehrere Aufgaben laufen gleichzeitig, jede in einem eigenen Git-Worktree mit eigenem Branch und eigenem Agenten. Claude entscheidet selbst, ob sich das lohnt. Ist es unsicher, fragt es den Nutzer.

## Wann prüfen

Immer wenn mehr als eine Aufgabe ansteht und der Nutzer nicht ausdrücklich eine bestimmte will: "arbeite die Warteschlange ab", "mach den Sprint", "erledige W-0012 bis W-0015", `auto_next` nach einem Abschluss. Bei einer einzelnen Aufgabe nicht.

```
works parallel plan                  Warteschlange, Sprint und die besten Vorschläge
works parallel plan W-0012,W-0015    nur diese
```

Die Ausgabe hat eines von drei Ergebnissen:

| Ergebnis | Bedeutung | Vorgehen |
|---|---|---|
| parallel | Mindestens zwei startklare Aufgaben ohne gemeinsame Dateien, ohne Abhängigkeiten, groß genug | Ohne Rückfrage parallel starten, dem Nutzer in einem Satz sagen, welche Aufgaben gleichzeitig laufen |
| nacheinander | Zu wenig startklar, Konflikte über Dateien oder Abhängigkeiten, oder nur kleine Aufgaben | Normal in dieser Sitzung arbeiten, eine nach der anderen |
| unsicher | Gleicher Ordner, gleicher Bereich ohne bekannte Dateien, als verwandt markiert oder nicht committete Änderungen | Dem Nutzer die Gründe aus der Ausgabe nennen und fragen: parallel oder nacheinander |

Zusätzlich gilt das eigene Urteil. Auch bei "parallel" nacheinander arbeiten, wenn absehbar ist, dass die Aufgaben dieselbe Schnittstelle, dasselbe Datenbankschema, gemeinsame Konfiguration oder `package.json` ändern, oder wenn eine Aufgabe die Grundlage der anderen schafft. Im Zweifel fragen.

Für Agenten ungeeignet und deshalb ausgelassen: unvollständige Aufgaben, offene Fragen, fehlende Akzeptanzkriterien, Gestaltung ohne gewählten Entwurf, blockierte Aufgaben. Diese bleiben bei Claude in der Hauptsitzung oder warten auf den Nutzer.

## Ablauf

1. Starten:
   ```
   works parallel start W-0012,W-0015
   ```
   Legt je Aufgabe einen Worktree neben dem Projekt an (`<projekt>.works-lanes/W-0012-...`), mit dem Branch aus dem Namensschema von `works start`, setzt die Aufgabe auf In Arbeit und legt `.works.link` in den Worktree. Damit schreibt das works CLI dort immer in die `.works` des Hauptprojekts. Die aktive Aufgabe der Hauptsitzung bleibt unverändert.
2. Je Aufgabe den Auftrag holen und einen Agenten starten, alle in derselben Antwort, damit sie gleichzeitig laufen:
   ```
   works parallel prompt W-0012
   ```
   Den Text unverändert als Auftrag an den Agenten geben. Er enthält Worktree, Branch, Beschreibung, Kriterien, Plan, Übergabe, Projektwissen und die Regeln für den Agenten. Keine Worktree-Isolation des Agent-Werkzeugs zusätzlich verwenden, der Worktree steht schon.
3. Während die Agenten laufen: `works parallel status` zeigt Commits und offene Dateien je Bahn. Anweisungen des Nutzers aus dem Board gehen an den Agenten der jeweiligen Aufgabe.
4. Ergebnis prüfen, wenn ein Agent fertig ist: Antwort lesen, `works show <ID>` (Häkchen, Übergabe, Fragen), Diff im Branch ansehen. Hat der Agent Fragen notiert, sie dem Nutzer stellen.
5. Abschließen je Aufgabe:
   ```
   works parallel finish W-0012            Worktree weg, Branch bleibt für Review oder Pull Request
   works parallel finish W-0012 --merge    zusätzlich mit --no-ff in den Basis-Branch mergen
   ```
   Mergen nur, wenn der Nutzer das will oder der git-workflow Skill es so vorsieht. Ein Merge mit Konflikt wird abgebrochen, der Worktree bleibt. Dann im Worktree den Basis-Branch hineinmergen, Konflikte lösen und erneut abschließen. Danach wie gewohnt `works done <ID>` mit Prüfungen und Definition of Done.
6. Abbrechen: `works parallel abort W-0012` entfernt den Worktree. Hat der Branch Commits, bleibt er erhalten. Nicht committete Änderungen nur mit `--force` verwerfen und nur auf Wunsch des Nutzers.

## Regeln für die Hauptsitzung

- Höchstens `parallel.max` Bahnen gleichzeitig (Standard 3).
- Vor dem Start sollte der Arbeitsstand committet sein. Worktrees beginnen beim letzten Commit.
- Keine Aufgabe in der Hauptsitzung bearbeiten, die gerade parallel läuft. `works start` und `works done` lehnen das ab, solange der Worktree besteht.
- Kosten im Blick behalten: Jeder Agent verbraucht eigene Tokens. Der SubagentStop Hook rechnet sie der Aufgabe zu.
- Am Ende dem Nutzer zusammenfassen: welche Aufgaben fertig sind, welche Fragen offen sind, was gemergt ist und was als Branch wartet.

## Was im Board sichtbar ist

Karten laufender Bahnen tragen "Parallel" und zeigen den aktuellen Schritt des Agenten. Der Kopf zeigt "2 Agenten parallel". Im Reiter Code und Commits steht der Worktree mit Commits und offenen Dateien. Unter Werkzeuge, Parallelarbeit stehen laufende Bahnen und die Einschätzung für die nächsten Aufgaben.
