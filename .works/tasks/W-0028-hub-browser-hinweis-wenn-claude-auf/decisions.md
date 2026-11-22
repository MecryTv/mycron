# Entscheidungen W-0028

## Gewählter Entwurf

- 2026-11-22: Variante B „Einladung unter dem Kopf“ gewählt, Grund: Nutzer am 2026-11-22: Empfehlung genommen. Einladung erklärt einmal, wozu die Erlaubnis gebraucht wird, danach nur die Glocke. Datei: design/B-einladung-unter-dem-kopf.html. Nicht gewählt: A Glocke im Kopf, C Schalter in der Kennzahl

## Entscheidungen
### E1: Hinweis bei wartender Freigabe
- Datum: 2026-11-22
- Quelle: Umsetzung
- Kontext: Der Hub kennt über alle Projekte, wo Claude auf eine Freigabe wartet; liegt der Tab im Hintergrund, sieht man es nicht
- Entscheidung: Variante B: Einladung unter dem Kopf, danach nur die Glocke. Kennung je Freigabe aus Projekt-Hash und Zeitpunkt; gemeldet wird jede neue genau einmal und nur im Hintergrund; die Wahl steht im Browser
- Begründung: Nutzer hat am 2026-11-22 die Empfehlung B genommen; die Erlaubnis wird erst nach einem Klick und mit Erklärung abgefragt
- Verworfene Alternativen:
  - A Glocke allein: erklärt nicht
  - wozu die Erlaubnis dient
  - C Schalter in der Kennzahl: zu versteckt
- Konsequenzen: Hinweise kommen nur, solange ein Hub-Tab offen ist; Freigaben, die beim Laden schon warten, werden nicht gemeldet
