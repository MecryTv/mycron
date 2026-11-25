# Szenarien für works shot

`works shot --scenario <datei.mjs> [--widths 1440,390] [--themes light,dark] [--name ..] [--out ordner]` stellt vor jeder Aufnahme einen Zustand her, nimmt auf und räumt danach auf. Gedacht für Bilder, die sich mit `works shot <ansicht>` nicht herstellen lassen: ein verwaister Tab, eine wartende Freigabe im Hub, der Abnahmedialog.

Jede Breite und jedes Schema bekommt einen frischen Aufbau, damit sich Zustände nicht gegenseitig stören. Die Bilder durchlaufen dieselbe Prüfung wie bei `works shot` (seitliches Scrollen, Fehler auf der Seite, nicht geladene Dateien).

## Aufbau einer Szenario-Datei

```js
export default {
  name: 'verwaister-tab',               // Dateiname der Bilder, sonst der Name der Datei
  async setup(kit) {                    // Zustand herstellen, Start-URL zurückgeben
    const a = kit.project('mycron', [{ title: 'Hub-Seite', priority: 'P3' }]);
    return { url: await kit.board(a), a };
  },
  async prepare(page, kit, state) {     // optional: auf der Seite klicken, warten, umschalten
    await page.waitForSelector('.card');
  },
};
```

## Was das kit kann

| Aufruf | Wirkung |
|---|---|
| `kit.project(name, aufgaben)` | Wegwerf-Projekt mit `works init`, Aufgaben als Titel oder `{ title, priority, type }`. Gibt den Ordner zurück |
| `kit.works(ordner, args, { env })` | works-Befehl im Projekt, wirft bei Fehlern. `env: kit.realProfile` für Befehle, die selbst Chrome starten (etwa `works shot`) |
| `await kit.board(ordner, { port })` | Board auf einem freien Port (ab 49300) oder dem angegebenen starten, gibt die URL zurück |
| `kit.stop(ordner)` | Board stoppen (seine offenen Tabs zeigen „<Projekt> ist beendet“, W-0054) |
| `await kit.crash(ordner)` | Board ohne Ankündigung beenden, wie abgestürzt; seine Tabs verbinden sich neu wie bisher. Wartet, bis der Port frei ist |
| `kit.hook(ordner, 'permission.mjs', eingabe)` | Hook von works auslösen, etwa eine wartende Freigabe |
| `kit.file(name, inhalt)` | Datei im Wegwerf-Ordner anlegen, gibt den Pfad zurück |
| `kit.dir` | Der Wegwerf-Ordner |

Das kit arbeitet mit eigenem HOME: Die Projekte landen nicht in der echten Projektliste, es öffnet sich kein Browser. Am Ende stoppt es alle Boards seiner Projekte und löscht den Ordner, auch wenn `setup` scheitert.

Eine Szenario-Datei ist ausführbarer Code. Nur eigene oder geprüfte Dateien verwenden.

## Beispiele

- `verwaister-tab.mjs`: Board endet, auf seinem Port startet ein anderes Projekt (W-0029)
- `freigabe-im-hub.mjs`: zwei Boards, in einem wartet Claude auf eine Freigabe (W-0028)
- `abnahme.mjs`: Aufgabe im Review mit gewähltem Entwurf und Nachher-Bild (W-0030)
