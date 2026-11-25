---
id: W-0055
title: "Kopfleiste im Board: Live-Anzeige von Claude bei langem Text kaputt"
type: bug
priority: P3
status: in-arbeit
effort: S
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed:
milestone:
branch: fix/w-0055-kopfleiste-im-board-live
tags: [ui, board]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Kopfleiste im Board: Live-Anzeige von Claude bei langem Text kaputt

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gemeldet vom Nutzer am 2026-11-24 mit Screenshot: In der Kopfleiste des Boards ist die Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 Agent“ zu lang. Sie drückt sich an die Ansichtswahl (Board, Sprint, Warteschlange …), die Zeit steht als eigenes Kästchen mitten im Satz, und vor dem Komma steht ein Leerzeichen („1 min , 1 Agent“). Wunsch: Die Leiste soll auch bei langem Text sauber aussehen.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. 

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
- Die Pille `button.busy#busy` steht in `.brand` und hat `white-space: nowrap`, kann also nicht schrumpfen. `.brand` selbst hat `min-width: 0`: Wird die Zeile knapp, schrumpft nur der Kasten der Marke, ihr Inhalt läuft über die Reiter. Was in der Marke schrumpfen kann, ist allein der Projektname (`h1` mit `overflow: hidden`), er wurde bis auf 0 px gedrückt; das Suchfeld hatte keine Mindestbreite und schrumpfte bis auf das `/`.
- Der Verbindungstext daneben („Live, Stand 20:25:46“, „Verbindung getrennt, neuer Versuch läuft“) ist ebenfalls `nowrap` und schrumpft nicht. Im gemeldeten Bild nahm er zusammen mit der Pille rund 550 px ein.
- Zeitkasten und Leerzeichen vor dem Komma: Die Pille ist `inline-flex` mit `gap: 7px`. Der Satz besteht aus Text und dem `<span class="num">` aus `lvSince()`, jedes Stück wird ein eigenes Flex-Element mit 7 px Abstand. So steht „1 min“ abgesetzt da, und zwischen ihm und dem folgenden „, 1 Agent“ (aus `join(', ')`) liegt der Abstand wie ein Leerzeichen vor dem Komma.
- Belegt mit dem neuen Selbsttest gegen den alten Stand: bei 1880 px Suche 48 px breit, bei 390 px Projektname 0 px, innerText „seit\n12 min\n, 2 Agenten parallel“.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
Umgesetzt nach Entwurf B „Kompakter Chip mit Popover“ (board.js `renderBusy()`, template.html, board.css, de.json):
- Chip statt Satz: Im Chip stehen nur Aufgabe und Dauer („W-0050 · 12 Min.“), bei mehreren Agenten eine Plakette mit ihrer Zahl. Bei einer Freigabe „Freigabe nötig · 2 Min.“ in der Warnfarbe, ohne Hauptsitzung „2 Agenten“. Der Chip schrumpft nicht (`flex: none`) und ist kurz genug, dass er nicht mehr über die Reiter ragt. Die Dauer ist übersetzbar („12 Min.“, „1 Std. 5 Min.“).
- Popover darunter (`#busyPop`): „Claude arbeitet seit 12 Min.“, Aufgabe mit Titel, „2 Agenten parallel“ mit ihren Aufgaben, bei einer Freigabe der wartende Aufruf, unten der letzte Schritt („Zuletzt: Befehl, vor 20 s“) und „Zur Live-Ansicht“. Der Satz im Kopf des Popovers steckt in einem eigenen span, damit kein Flex-Abstand mehr vor der Zeit entsteht. Alle Zeiten zählt der Sekundentakt weiter, auch das aria-label.
- Bedienung: Maus darüber öffnet (eine unsichtbare Brücke hält es beim Hinüberfahren offen), Klick führt wie bisher in die Live-Ansicht. Tastatur: Fokus auf dem Chip öffnet, Tab erreicht den Knopf, Esc schließt und setzt den Fokus zurück, Enter führt in die Live-Ansicht. Touch: erster Tipp öffnet, Tipp daneben schließt, zweiter Tipp auf den Chip führt weiter. Der Chip hat als aria-label den vollen Text.
- Offen bei Tastaturfokus über `:focus-within` plus Klasse `.kb`, die nur bei `:focus-visible` gesetzt wird. `:has(:focus-visible)` war der erste Versuch: Beim Tab vom Chip zum Knopf schließt das Popover kurz, und Chromium verliert den Fokus (im Test nachgestellt).
- Platz in der Marke: Neben dem Chip zeigt die Verbindungsanzeige nur den Punkt (Text bleibt für Screenreader); ist die Verbindung getrennt, bleibt der Text sichtbar, wird aber mit … gekürzt. Das Suchfeld behält mindestens 140 px. Reicht der Platz ab 1641 px trotzdem nicht, setzt `fitTop()` zuerst `.squeeze` (Projektname darf bis 5em schrumpfen) und erst danach `.tight` (Reiter rutschen wie unter 1640 px in die zweite Zeile, etwa Freigabe-Chip bei 1720 px), statt dass etwas überdeckt wird. Der Projektname schrumpft nicht von sich aus mit, weil Flexbox ihm sonst schon einen Bruchteil eines Pixels abzieht und er mit … gekürzt wird. Gemessen wird an den Kindern der Marke, nicht an `scrollWidth`, weil das offene Popover über die Marke hinausragt.
- Am Handy hängt das Popover an der Marke und nutzt die Breite bis 32 px Rand.
- Abweichung vom Kriterium „gekürzt mit …, voller Text als Tooltip“: Das stammt aus Entwurf A. Mit B wird der Chip nicht gekürzt, der volle Text steht im Popover und im aria-label.

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] Bei langem Text bleibt die Live-Anzeige in ihrem Platz (gekürzt mit …, voller Text als Tooltip) und überdeckt oder verschiebt die Ansichtswahl nicht

## Betroffene Dateien

## Assets
![Kopfleiste des Boards: Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 A](assets/2026-11-24-kopfleiste-des-boards-live-anzeige-vorher.png)
Beschreibung: Kopfleiste des Boards: Live-Anzeige „Claude arbeitet an W-0050, seit 1 min , 1 Agent“ drückt gegen die Ansichtswahl, Zeit als eigenes Kästchen, Leerzeichen vor dem Komma
Art: vorher · Hinzugefügt: 2026-11-24

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Asset hinzugefügt: assets/2026-11-24-kopfleiste-des-boards-live-anzeige-vorher.png (vorher)
- 2026-11-25: Entwurf A „Kürzen mit Tooltip“ angehängt
- 2026-11-25: Entwurf B „Kompakter Chip mit Popover“ angehängt
- 2026-11-25: Entwurf C „Eigene Zeile bei Platzmangel“ angehängt
- 2026-11-25: Entwürfe A bis C mit Fable 5.2 gestaltet, auf Basis des echten board.css. Befund: .brand hat min-width 0, die Pille white-space nowrap ohne Schrumpfen, deshalb ragt sie über die Reiter; der Zeitkasten ist span.num aus lvSince(), das Leerzeichen vor dem Komma kommt aus join(', '). Wartet auf die Wahl des Nutzers.
- 2026-11-25: Entwurf B „Kompakter Chip mit Popover“ gewählt. Grund: Nutzer am 2026-11-25: Beide B
- 2026-11-25: Parallel gestartet im Worktree W-0055-kopfleiste-im-board (Status: backlog → in-arbeit)
