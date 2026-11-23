# Zusammenspiel mit anderen Skills und Werkzeugen

Jede Integration ist optional. Ist ein Skill nicht installiert, den Schritt auslassen oder von Hand erledigen.

## Gestaltung mit UI UX Pro Max und Superpowers Brainstorming

Bei Gestaltungsaufgaben (Typ design oder Tag ui, design, ux) arbeitet Claude die Entwürfe selbst aus, sobald einer der beiden Skills installiert ist. Der Nutzer muss nicht darum bitten. `works start` sucht unter `~/.claude/skills` und `~/.claude/plugins` nach Ordnern namens `ui-ux-pro-max` und `brainstorm*` und nennt die gefundenen Skills in der Ausgabe.

Alles landet im Aufgabenordner unter `design/`, Index in `design/design.json`. Das Board zeigt es im Tab Entwürfe: Farben und Schrift, die Varianten als Vorschau (HTML-Mockups laufen in einem abgeschotteten iframe), das Brainstorming und die Wahl des Nutzers.

Ablauf:

1. Brainstorming (Superpowers) mit der Aufgaben-ID, der Beschreibung und den Kriterien starten. Fragen an den Nutzer wie gewohnt stellen. Das Ergebnis anhängen:
   ```
   works design brainstorm W-0006 --file docs/superpowers/specs/2026-10-31-bracket-design.md
   ```
2. UI UX Pro Max mit Produktart, Zielgruppe und Stilwunsch aus der Aufgabe befragen. Die Designrichtung anhängen:
   ```
   works design direction W-0006 --file richtung.md --colors "Grund #0F1420,Akzent #3DD6B5,Live #FF5A5F" --fonts "Space Grotesk,Inter"
   ```
   `--file` ist ein Markdown-Text mit Stil, Regeln und Begründung, `--colors` die Palette als `Name #hex` mit Komma getrennt.
3. Zwei bis drei Varianten als eigenständige HTML-Datei (alles inline, keine externen Skripte) oder als Bild bauen und einzeln anhängen:
   ```
   works design add W-0006 --name A --title "Klassisches Bracket" --file /tmp/a.html --note "Alle Runden nebeneinander"
   works design add W-0006 --name B --title "Runden als Tabs" --file /tmp/b.html
   ```
   Namen sind kurz (A, B, C). Die Datei wird als `design/A-klassisches-bracket.html` kopiert.
   Das Board zeigt HTML-Entwürfe in einem abgesicherten iframe, das nur `data:`, `blob:` und `https` lädt. Verweist der Entwurf auf lokale CSS, Schriften oder Bilder (relativ oder `file://`), warnt `design add` und nennt die Verweise: Im Board fehlen sie. Vorher einbetten, mit dem Plugin mockups: `entwurf.mjs inline <datei> --variant A`.
4. Dem Nutzer sagen, dass die Entwürfe im Board unter Entwürfe liegen, und auf seine Wahl warten. Er wählt im Board mit "Diese nehmen" oder im Gespräch, dann `works design choose W-0006 B --reason "..."`. Die Wahl landet in decisions.md unter "Gewählter Entwurf". Die Sitzungsübersicht meldet Aufgaben mit Entwürfen ohne Wahl.
5. Erst danach umsetzen. Die gewählte Variante ist die Vorgabe. Abweichungen mit dem Nutzer klären.
6. Vor dem Review einen Screenshot des Ergebnisses ablegen: `works shot --url <seite> --asset W-0006 --kind nachher --desc "..."` (oder ein vorhandenes Bild mit `works asset W-0006 shot.png --kind nachher --desc "..."`). Das Board stellt ihn in der Abnahme neben den gewählten Entwurf. Für den Vergleich in gleicher Breite und gleichem Schema je Kombination ein Bild ablegen, etwa `works shot --url <seite> --widths=1440,390 --themes=light,dark --asset W-0006 --kind nachher` (Namen mit `-light-1440`, `-dark-390`).

Zusätzlich bleiben die bisherigen Wege gültig: Entscheidungen als E-Block in `decisions.md` mit `--source "UI UX Pro Max"`, verworfene Varianten mit Grund. Projektweite Design-Systeme nur mit `works attach-doc` verlinken, nicht in eine Aufgabe kopieren.

Ist keiner der beiden Skills installiert, die Gestaltung wie bisher mit dem Nutzer klären und trotzdem mindestens einen Entwurf mit `works design add` zeigen, wenn es um sichtbare Oberflächen geht.

## Superpowers Brainstorming ohne Gestaltung

Für Brainstormings zu Architektur oder Abläufen das erzeugte Dokument mit `attach-doc` übernehmen, statt den Skill umzubauen:

```
works attach-doc W-0012 docs/superpowers/specs/2026-10-29-login-design.md --label "Brainstorm Login"
```

Der Modus kommt aus `config.json` unter `brainstorm.mode`: `link` (Standard, verlinkt), `copy` (Kopie nach `tasks/<ID>/docs/`) oder `move`. Mit `--mode` pro Aufruf überschreibbar. Danach in `decisions.md` die Brainstorm-Zusammenfassung schreiben, Entscheidungen als E-Block festhalten und Kriterien und Umsetzungsplan ableiten. Ergeben sich mehrere Arbeitspakete, je eine Aufgabe anlegen und verknüpfen. Einen Implementierungsplan von Superpowers ebenfalls anhängen.

## git-workflow

- `works start <ID>` schlägt einen Branch nach dem Schema `<präfix>/<id>-<slug>` vor und schreibt ihn ins Frontmatter. Präfixe: feature und design → `feature/`, bug → `fix/` (bei P1 `hotfix/`), refactor und debt → `refactor/`, chore und spike → `chore/`.
- Ist der git-workflow Skill aktiv, legt dieser den Branch an und verwendet dabei genau diesen Namen. Sonst `works start <ID> --git`.
- Commit-Messages enthalten die ID: `fix(W-0007): Rolle nach Captcha vergeben`. Dadurch findet `works commits <ID>` alle zugehörigen Commits.
- Bei Parallelarbeit legt `works parallel start` die Branches selbst an, jeweils in einem eigenen Worktree. Der git-workflow Skill legt dann keinen weiteren Branch an. Gemergt wird mit `works parallel finish <ID> --merge` (ebenfalls `--no-ff`) oder über einen Pull Request.
- Beim Merge über git-workflow anschließend `works done <ID>` ausführen. Umgekehrt gilt: `works done --confirm` erst, wenn der Merge erfolgreich war oder der Nutzer ihn bewusst später machen will.

## code-audit

Steht standardmäßig in der Definition of Done. Vor `works done --confirm` den code-audit Skill auf die Änderungen der Aufgabe anwenden. Funde mit hoher Schwere sind entweder zu beheben oder als neue Aufgabe zu erfassen (`works new --type bug ... --related <ID>`). Bewusst akzeptierte Abkürzungen als technische Schuld (Typ debt) anlegen.

## responsive-website-check

Gilt für Aufgaben mit Tag `ui`. Vor dem Abschluss ausführen. Gefundene Darstellungsfehler entweder direkt beheben oder als Bug mit Screenshot (`--kind fehler`) erfassen.

## second-brain-sync

Meldet `works done`, dass decisions.md Entscheidungen enthält, dem Nutzer anbieten, die wichtigen davon ins Decision Log des Second Brain zu übernehmen. Übertragen werden Entscheidung, Begründung und verworfene Alternativen, nicht der Verlauf.

## GitHub

Der Abgleich läuft automatisch über das gh CLI, sobald das Projekt ein GitHub-Repository ist und gh angemeldet ist: beim Sitzungsstart im Hintergrund und alle `interval_min` Minuten, solange das Board läuft. Der erste Lauf merkt sich nur den Stand und ändert nichts. Änderungen tragen `[GitHub]` im Verlauf.

| Ereignis | Folge |
|---|---|
| PR mit der ID im Titel oder Branch wird geöffnet | Aufgabe in Arbeit geht nach Review |
| CI eines PR wird grün oder rot | Prüfung `ci` an der Aufgabe, rot blockiert den Abschluss |
| Review mit Änderungswünschen | Text als Kommentar an Claude, Aufgabe zurück nach In Arbeit |
| PR wird gemergt | `works done --confirm` ohne erneute Prüfungen. Ist die Definition of Done offen, bleibt die Aufgabe in Review und bekommt einen Kommentar mit den offenen Punkten |
| Neues Issue nach dem ersten Lauf | Neue Aufgabe, unvollständig markiert, Typ und Priorität aus den Labels |
| Aufgabe aus einem Issue ist erledigt | Issue wird mit Hinweis auf die ID geschlossen |

Befehle: `works github status` zeigt Repository, letzten Lauf und Ereignisse, `works github sync` gleicht sofort ab, `works github set issues=false labels=bug,works` ändert Einstellungen. Im Board unter Werkzeuge, GitHub. Einstellungen in `config.json` unter `github_sync`, siehe config.md.

Weiterhin verfügbar: `works gh-import` für einen einmaligen Import alter Issues und `works gh-export <ID>` (nur nach Zustimmung). Label-Zuordnung in `config.json` unter `github`.

## Discord-Bot works

Hinweise aufs Handy für alle Projekte, auch ohne offenes Board. Zwei Wege, `works discord` zeigt beide (Entwurf R aus W-0040). Claude fragt nie nach Token, Schlüssel oder Code und gibt sie nie aus.

Gemeinsamer Bot (empfohlen, W-0040): Der Dienst `services/works-bot` läuft auf einem Server und kennt als einziger das Token. Der Nutzer lädt den Bot mit dem Link aus `works discord` ein, tippt im gewünschten Kanal `/works verbinden` (braucht „Server verwalten“) und trägt den Code ein: `works discord link <Code>`. works bekommt einen Geräteschlüssel (nur in `~/.works/discord/secret.json`), darf damit nur in diesen Kanal schreiben und nur eigene Nachrichten bearbeiten. Erwähnt wird, wer `/works verbinden` ausgeführt hat. Der lokale Bot läuft wie beim eigenen Bot, schickt aber über den Dienst und braucht kein Gateway. Adresse des Dienstes: `works discord set service=https://…` (bis sie im Plugin hinterlegt ist). Trennen: `works discord unlink` oder in Discord `/works trennen`. Betrieb des Dienstes: `services/works-bot/README.md`.

Eigener Bot, Einrichtung (der Nutzer im eigenen Terminal):
1. Im Discord-Entwicklerportal eine Anwendung mit Bot anlegen und das Token kopieren.
2. `Get-Clipboard | works discord token` oder `works discord token` (fragt versteckt). Prüft das Token, erkennt den Besitzer der Anwendung (der wird erwähnt) und gibt den Einladungslink mit genau den nötigen Rechten aus: Kanal sehen, Nachrichten senden, Links einbetten, Verlauf lesen, Nachrichten anheften.
3. Einladen, dann `works discord channel` und `works discord channel works`.

Danach startet der Bot mit jedem Board und beim Sitzungsstart, einer je Rechner (Sperrdatei `bot.pid`); eine neue works-Version ersetzt ihn. Unter Node 22 verbindet er sich mit dem Gateway (online sichtbar), darunter schickt er nur über REST.

Was er schickt (Entwurf F2 aus W-0036):
- Je Projekt einen angehefteten Statuspost: aktive Aufgabe mit Kriterien, Freigabe, CI, heute erledigt und Kosten, die nächsten zwei Aufgaben, die letzten drei Ereignisse. Er wird gebündelt bearbeitet (höchstens alle 10 s) und neu angelegt, wenn jemand ihn löscht.
- Ereignisse mit Feldern: Freigabe wartet (nach 30 s), Claude fertig (nach 120 s), Frage, Review, angenommen, zurückgegeben, erledigt, works ship als eine Nachricht mit Schritten, CI rot mit Bug und wieder grün, neue P1, Warteschlange leer, Wochenbericht.
- Erledigtes wird nachträglich bearbeitet: Freigabe beantwortet wird grau, Review angenommen grün.
- Nur Ereignisse mit `at` erwähnen den Nutzer (Standard: die drei aus „Claude braucht dich“), alles andere kommt still. In der Ruhezeit (Standard 22 bis 7 Uhr) kommt auch das still.
- Befehle aus Freigaben gehen nur mit `privacy.commands=an` mit. Links nur auf GitHub, nie auf das lokale Board.

Wie Ereignisse entstehen: Der Bot liest den Stand der angemeldeten Projekte (Aufgaben, Warteschlange, `activity.json`) und vergleicht ihn mit dem letzten. Hooks tun dafür nichts zusätzlich. ship, ci-watch und `report --week` legen Ereignisse mit `works discord emit` in `~/.works/discord/outbox`; läuft der Bot nicht, holt er sie beim nächsten Start ab. Fehler bei Discord (429, 5xx, Netz) werden später wiederholt, nichts geht verloren.

Doppelmeldungen vermeidet er so: Wechselt der Branch, übernimmt er den Stand ohne Vergleich; während `works ship` friert er ihn ein und vergleicht am Ende mit dem Stand davor; P1, Erledigung und Fragen meldet er je Aufgabe höchstens einmal am Tag. Freigaben aus parallelen Bahnen meldet er wie die der Hauptsitzung, solange die Bahn in `lanes.json` steht.

Prozess: `bot.pid` ist die Sperrdatei, der Bot erneuert sie alle 5 s. Eine alte Datei, deren PID inzwischen ein anderer Prozess hat, zählt nicht; `stop` beendet nie einen fremden Prozess. Arbeitsordner ist `~/.works/discord`, damit kein Projekt- oder Worktree-Ordner gesperrt bleibt. Eine neue works-Version ersetzt den Bot, ohne dass Board oder Sitzungsstart warten. Wechselt das Token auf eine andere Bot-Anwendung, beginnt der Bot mit neuen Statusposts.

Befehle und Knöpfe (W-0037, Entwurf HS): `/works help` (hilfe), `status`, `tasks` (aufgaben), `new` (neu, Titel und Priorität), `instruct` (anweisung, an die Aufgabe in Arbeit oder mit `task`); beim gemeinsamen Bot dazu `link` (verbinden) und `unlink` (trennen). Englische Namen, im deutschen Discord deutsch; die Antworten folgen der Sprache des Discord-Clients. Bei mehreren Projekten nennt man es mit `project` (der Anfang des Namens reicht). Knöpfe: Review mit „Annehmen“ und „Zurück an Claude“ (Dialog für die Begründung, die als Kommentar ankommt), „Claude ist fertig“ mit „Anweisung an Claude“ (Dialog), CI rot mit „Bug ansehen“. Nach Annahme oder Rückgabe verschwinden die Knöpfe. Nur der eingetragene Nutzer (Besitzer der Anwendung beim eigenen Bot, wer `/works verbinden` ausgeführt hat beim gemeinsamen) darf etwas auslösen, andere bekommen eine Absage; alle Antworten sieht nur, wer geklickt hat. Freigaben aus Claude Code erteilt der Bot nicht. Aktionen laufen über dieselbe API wie das Board: Verlaufseinträge mit `[Discord]`, Rückgängig im Board, neue Aufgaben mit `source: discord` und `incomplete: true` (beim nächsten passenden Moment mit dem Nutzer vervollständigen). Annehmen läuft wie `works done --confirm`; ist die Definition of Done nicht erfüllt, sagt der Bot das, statt abzuschließen.

So kommen Klicks an: Der eigene Bot registriert `/works` für den Server des Kanals und bekommt Klicks über sein Gateway (ab Node 22, sonst gibt es keine Knöpfe). Beim gemeinsamen Bot antwortet der Dienst sofort vorläufig, öffnet Dialoge selbst und legt die Anfrage in eine Inbox des Geräts, das die Nachricht geschrieben hat (Befehle: das zuletzt aktive Gerät im Kanal). Der lokale Bot holt sie mit Long-Poll ab und antwortet über den Dienst; das Token der Interaktion bleibt im Dienst. Ist das Gerät aus, sagt der Dienst das nach 10 s.

Protokoll in `~/.works/discord/bot.log` (ohne Token). Die Einstellungen im Board kommen mit W-0038.

## Playwright und Browser-Werkzeuge

Für Vorher- und Nachher-Screenshots, siehe assets.md.
