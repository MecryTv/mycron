# Entscheidungen W-0029

## Gewählter Entwurf

- 2026-11-22: Variante B „Leiste über dem letzten Stand“ gewählt, Grund: Nutzer am 2026-11-22: Empfehlung genommen. Der letzte Stand bleibt ausgegraut sichtbar, Leiste mit den Knöpfen. Datei: design/B-leiste-ueber-dem-letzten-stand.html. Nicht gewählt: A Ersatzseite, C Dialog über dem letzten Stand

## Entscheidungen
### E1: Verwaisten Tab erkennen und anzeigen
- Datum: 2026-11-22
- Quelle: Umsetzung
- Kontext: Ein Tab verbindet sich nach dem Ende seines Boards mit jedem Server, der danach auf dem Port läuft
- Entscheidung: Variante B: Leiste oben, letzter Stand ausgegraut und inert. Erkennung über meta.rootId (Hash des echten Projektpfads), Start über POST /api/hub mit dem Token aus /boards
- Begründung: Nutzer hat am 2026-11-22 die Empfehlung B genommen; ein Hash verrät in geteilten Daten keinen Pfad; /boards ist nur lokal erreichbar
- Verworfene Alternativen:
  - A Ersatzseite: verbirgt den letzten Stand
  - C Dialog: verdeckt den Stand; Projektname als Kennung: nicht eindeutig bei gleichen Ordnernamen
- Konsequenzen: Tabs ohne rootId (ältere Seiten) werden nicht als verwaist erkannt und laden wie bisher neu
