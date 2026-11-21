# Entscheidungen W-0009

## Gewählter Entwurf

- 2026-11-21: Variante A „Live-Ansicht Ergänzungen W-0006 bis W-0009“ gewählt, Grund: Nutzer: Beide A (Freigabe A Kacheln, Verbrauch A in Kachel und Kopf), Rest wie im Entwurf. Datei: design/A-live-ansicht-ergaenzungen-w.html

## Entscheidungen

- 2026-11-21: Verlauf als `hist` je Ergebnis in checks.json, höchstens fünf Läufe mit Ergebnis, Dauer und Zeit. Ein geänderter Befehl oder Arbeitsordner beginnt von vorn. Alte Ergebnisse ohne `hist` zählen als erster Lauf.
- 2026-11-21: "wackelig" heißt: in den letzten fünf Läufen mindestens zweimal zwischen bestanden und fehlgeschlagen gewechselt (etwa ofoof oder ofo). Die Beschreibung nennt "sowohl bestanden als auch fehlgeschlagen", der Entwurf "mindestens zweimal rot". Beides würde eine Prüfung, die nach vier grünen Läufen einmal rot wird (oooof), als wackelig melden, obwohl sie nur gerade kaputt ist. Mit zwei Wechseln trifft es genau das Hin und Her. Rückfrage an den Nutzer im Abschlussbericht.
- 2026-11-21: Laufzeittrend gegen den Median der bestandenen Läufe davor statt nur gegen den letzten Lauf: robuster gegen einen einzelnen Ausreißer. Mit nur einem Lauf davor ist das derselbe Vergleich wie in der Beschreibung. Deutlich heißt mindestens 1,5-mal so lang oder kurz und mindestens 5 Sekunden Unterschied. Fehlgeschlagene Läufe zählen nicht, sie brechen oft früh ab.
- 2026-11-21: wackelig und Trend rechnet der Server (board.mjs, flakyOf und trendOf in checks.mjs), das Board zeigt nur an. So sind die Regeln im Selbsttest prüfbar.
- 2026-11-21: In der Zeile einer Prüfung steht rechts nur noch die Dauer, der Zustand steckt im Symbol und steht für Screenreader als versteckter Text da. Damit bleibt Platz für den Befehl und den Verlauf.
- 2026-11-21 (Review): Korrektur. Wackelig zählt nur Wechsel zwischen Läufen auf demselben Codestand (`fp` je Lauf im Verlauf). Der normale Ablauf "kaputt gemacht, repariert" ergibt sonst schon zwei Wechsel und wäre fälschlich wackelig.
- 2026-11-21: Nutzer bestätigt die Definition: wackelig erst ab zwei Wechseln ohne Codeänderung dazwischen.
