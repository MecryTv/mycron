# Entscheidungen W-0037

## Gewählter Entwurf

- 2026-11-23: Variante HS „/works help“ gewählt, Grund: Wahl des Nutzers. Datei: design/HS-works-help.html. Nicht gewählt: H Befehle und Dialoge

## Entscheidungen
### E1: Erst vorläufig antworten, dann das Ergebnis
- Datum: 2026-11-23
- Quelle: Gespräch
- Kontext:
- Entscheidung: Befehle und Klicks bekommen sofort eine vorläufige Antwort nur für den Aufrufer, danach wird sie mit dem Ergebnis bearbeitet. Hilfe, Absagen und Dialoge antworten direkt.
- Begründung: Discord wartet nur 3 s; Annehmen läuft wie works done --confirm und kann Prüfungen starten.
- Verworfene Alternativen:
  - Direkt antworten: scheitert bei langsamen Aktionen
  - Öffentliche Antworten: andere im Server sähen Aufgaben und Kosten
- Konsequenzen:

### E2: Dialoge im gemeinsamen Modul, beim gemeinsamen Bot öffnet sie der Dienst
- Datum: 2026-11-23
- Quelle: Gespräch
- Kontext:
- Entscheidung: discord-ui.mjs enthält Befehle, Hilfe, Dialoge und das custom_id-Schema w:<aktion>:<projekt>:<aufgabe>. Der Dienst importiert es wie discord-api.mjs.
- Begründung: Dialoge lassen sich nicht vorläufig beantworten; das Gerät wäre über den Dienst zu langsam.
- Verworfene Alternativen:
  - Dialoge vom Gerät: zu spät
  - Zwei Kopien der Texte: laufen auseinander
- Konsequenzen:

### E3: Inbox mit Long-Poll für das Gerät
- Datum: 2026-11-23
- Quelle: Gespräch
- Kontext:
- Entscheidung: Der Dienst legt Befehle und Klicks in eine Inbox je Geräteschlüssel, das Gerät holt sie mit GET /v1/inbox ab und antwortet mit POST /v1/interactions/:id/reply. Das Token der Interaktion bleibt im Dienst. Klicks gehören zum Gerät, das die Nachricht geschrieben hat, Befehle zum zuletzt aktiven Gerät im Kanal. Nach 10 s ohne Abholung sagt der Dienst, dass das Gerät aus ist.
- Begründung: Das Gerät hat kein Gateway und keine öffentliche Adresse; Long-Poll braucht keine Abhängigkeit.
- Verworfene Alternativen:
  - Interaktions-Token an das Gerät geben: unnötig weit gestreut
  - WebSocket zum Dienst: mehr Code für dasselbe
- Konsequenzen:

### E4: Aktionen über die Board-API
- Datum: 2026-11-23
- Quelle: Gespräch
- Kontext:
- Entscheidung: Annehmen, Zurückgeben, Anweisung und neue Aufgabe laufen über runActionWithUndo wie im Board, mit Akteur Discord (Verlauf [Discord]) und source: discord.
- Begründung: Gleiche Prüfungen wie im Board, Rückgängig im Board möglich, kein zweiter Weg.
- Verworfene Alternativen:
  - Eigene CLI-Aufrufe im Bot: doppelte Logik
- Konsequenzen:
