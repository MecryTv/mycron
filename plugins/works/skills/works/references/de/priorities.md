# Prioritäten, Status, Aufwand und Risiko

## Prioritäten

Die Priorität beschreibt die Dringlichkeit aus Sicht des Projekts, nicht den Aufwand. Im Zweifel die niedrigere Stufe wählen und den Nutzer fragen.

| Prio | Name | Kriterien | Erwartete Reaktion | Beispiele |
|---|---|---|---|---|
| P1 | Kritisch | Produktion ist ausgefallen oder unbenutzbar, Datenverlust droht, Sicherheitslücke, rechtliches Risiko, Release blockiert | Sofort melden, laufende Arbeit unterbrechen, wenn der Nutzer zustimmt. Bug-Branches mit P1 bekommen das Präfix `hotfix/` | Bot crasht beim Start, Token im Repo veröffentlicht, Zahlungen schlagen fehl |
| P2 | Hoch | Wichtige Funktion fehlt oder ist für viele fehlerhaft, blockiert andere Aufgaben, harte Frist in Kürze | Als Nächstes einplanen | Verifizierung schlägt für neue Accounts fehl, Feature für feste Deadline |
| P3 | Mittel | Normale Features, Verbesserungen, Fehler mit Umgehungslösung | Regulär nach Reihenfolge | Neues Dashboard-Widget, Refactoring eines Moduls |
| P4 | Niedrig | Kosmetik, Komfort, Ideen mit unklarem Nutzen | Wenn Zeit ist oder im Zuge verwandter Arbeit | Hover-Animation, Wording-Anpassung |

Regeln:

- Eine P1 wird dem Nutzer sofort genannt, auch wenn gerade an etwas anderem gearbeitet wird.
- Mehr als drei offene P1 sind ein Warnsignal. Den Nutzer darauf hinweisen und gemeinsam neu bewerten.
- Prioritätsänderungen immer mit Begründung: `works set W-0012 priority=P1 --reason "..."`.
- Aus Code-Markern und GitHub-Labels abgeleitete Prioritäten sind Vorschläge. Bei der Vervollständigung prüfen.

## Status-Lebenszyklus

```
backlog ──> geplant ──> in-arbeit ──> review ──> erledigt
   │           │            │           │
   └───────────┴────────────┴───────────┴──> verworfen

erledigt / verworfen ──(reopen mit Begründung)──> backlog / geplant / in-arbeit
```

| Status | Bedeutung | Übergang durch |
|---|---|---|
| backlog | Erfasst, noch nicht eingeplant | `works new` |
| geplant | Soll als Nächstes angegangen werden, ist ausreichend beschrieben | `works set <ID> status=geplant` |
| in-arbeit | Wird gerade umgesetzt. Möglichst nur eine Aufgabe gleichzeitig | `works start <ID>` |
| review | Umsetzung fertig, wartet auf Prüfung durch den Nutzer oder Tests | `works set <ID> status=review` |
| erledigt | Definition of Done erfüllt | `works done <ID> --confirm` |
| verworfen | Wird nicht umgesetzt, Grund ist dokumentiert | `works drop <ID> --reason "..."` |

Blockiert ist kein eigener Status. Eine Aufgabe gilt als blockiert, solange eine Aufgabe in `blocked_by` nicht erledigt ist. `works start` verweigert dann den Start.

Unvollständig (`incomplete: true`) ist ebenfalls kein Status, sondern eine Markierung für schnell erfasste Aufgaben. Sie wird mit `works set <ID> incomplete=false` entfernt, sobald Ziel und Akzeptanzkriterien stehen.

## Aufwand

| Wert | Richtwert |
|---|---|
| S | Unter einer Stunde, eine Datei oder eine klar umrissene Stelle |
| M | Halber bis ganzer Tag, mehrere Dateien |
| L | Mehrere Tage, mehrere Module |
| XL | Über eine Woche. Sollte in kleinere Aufgaben zerlegt werden |

Bei XL dem Nutzer vorschlagen, die Aufgabe aufzuteilen und die Teile mit `blocked_by` zu verketten.

## Risiko

`niedrig`, `mittel` oder `hoch`. Hohes Risiko bedeutet: schwer rückgängig zu machen, schlecht getestete Bereiche, Datenmigrationen, Sicherheitsrelevanz. Bei hohem Risiko einen Rollback-Abschnitt ergänzen, auch wenn der Typ keinen vorsieht.

## Wie `works next` priorisiert

Startbar sind nur Aufgaben in `backlog` oder `geplant` ohne offene Blocker. Die Reihenfolge ergibt sich aus:

1. Priorität (stärkster Faktor)
2. Überfällig oder bald fällig
3. Status geplant vor backlog
4. Anzahl der Aufgaben, die dadurch frei werden
5. Kleiner Aufwand vor großem
6. Abzug für unvollständige Aufgaben und hohes Risiko

Die Empfehlung ist ein Vorschlag. Dem Nutzer die Begründung nennen und die Entscheidung überlassen.
