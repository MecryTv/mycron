// works demo: legt ein Beispielprojekt an, startet das Live-Board und spielt auf Wunsch Änderungen vor.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exists, loadTasks, saveTask, today } from './lib.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'works.mjs');

function w(root, args, actor = '') {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, WORKS_ACTOR: actor }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function newId(out) { return (out.match(/Angelegt: (\S+)/) || [])[1]; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Einfache Bildschirmskizzen als SVG, damit die Karten echte Vorschaubilder zeigen.
function mock(kind) {
  const bg = '#1c2330'; const line = '#2b3546'; const txt = '#8d98ab'; const acc = '#7f7bf6';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="#141a24"/>`;
  const bar = (x, y, w2, h = 14, c = line) => `<rect x="${x}" y="${y}" width="${w2}" height="${h}" rx="7" fill="${c}"/>`;
  if (kind === 'roles') {
    let s = head + `<rect x="40" y="40" width="880" height="520" rx="18" fill="${bg}" stroke="${line}"/>` + bar(80, 80, 220, 18, txt);
    ['Owner', 'Admin', 'Moderator', 'Support', 'Team'].forEach((r, i) => {
      const y = 140 + i * 80;
      s += `<rect x="80" y="${y}" width="800" height="62" rx="12" fill="#222b3a" stroke="${line}"/><circle cx="116" cy="${y + 31}" r="14" fill="${['#f0676c', '#f39a58', '#6ea2f7', '#b08af2', '#3dbe8b'][i]}"/>`;
      s += `<text x="146" y="${y + 37}" font-family="sans-serif" font-size="20" fill="#e6eaf2">@${r}</text>` + bar(700, y + 24, 140);
    });
    return s + '</svg>';
  }
  if (kind === 'bracket') {
    let s = head;
    for (let r = 0; r < 3; r++) {
      const n = 4 >> r;
      for (let i = 0; i < n; i++) {
        const y = 60 + (i + 0.5) * (480 / n) - 30; const x = 60 + r * 300;
        s += `<rect x="${x}" y="${y}" width="240" height="60" rx="10" fill="${bg}" stroke="${r === 2 ? acc : line}"/>` + bar(x + 16, y + 14, 140, 12, txt) + bar(x + 16, y + 34, 100, 12);
      }
    }
    return s + '</svg>';
  }
  if (kind === 'error') {
    return head + `<rect x="120" y="200" width="720" height="200" rx="16" fill="${bg}" stroke="#f0676c"/>`
      + `<text x="160" y="270" font-family="sans-serif" font-size="26" fill="#f0676c">Backup fehlgeschlagen</text>`
      + `<text x="160" y="320" font-family="sans-serif" font-size="18" fill="${txt}">ENOENT: no such file or directory, open 'backups/2026-10-29.json'</text>`
      + bar(160, 350, 260) + '</svg>';
  }
  return head + `<rect x="40" y="40" width="880" height="520" rx="18" fill="${bg}" stroke="${line}"/>`
    + bar(80, 80, 300, 20, txt) + bar(80, 140, 800) + bar(80, 170, 640) + bar(80, 200, 720)
    + `<rect x="80" y="260" width="380" height="220" rx="14" fill="#222b3a"/><rect x="500" y="260" width="380" height="220" rx="14" fill="#222b3a"/>`
    + `<rect x="700" y="500" width="180" height="40" rx="10" fill="${acc}"/></svg>`;
}

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }

export function seedDemo(root) {
  fs.mkdirSync(root, { recursive: true });
  if (exists(path.join(root, '.works'))) fs.rmSync(path.join(root, '.works'), { recursive: true, force: true });
  try { execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' }); } catch { /* ohne Git geht es auch */ }
  w(root, ['init']);
  w(root, ['milestone', 'add', 'M1', '--title=Livegang', '--due=2026-11-15', '--desc=Erste öffentliche Version von Bot und Dashboard']);
  w(root, ['milestone', 'add', 'M2', '--title=Turniersaison', '--due=2027-01-10']);
  const imgDir = path.join(root, '.works', '.tmp', 'demo-img');
  fs.mkdirSync(imgDir, { recursive: true });
  const img = (k) => { const f = path.join(imgDir, `${k}.svg`); fs.writeFileSync(f, mock(k)); return f; };

  const tasks = {};
  const add = (key, args, extra = {}) => {
    const id = newId(w(root, ['new', ...args]));
    tasks[key] = id;
    if (extra.goal) w(root, ['section', id, 'Beschreibung', `--text=${extra.goal}`, `--after=${extra.goalSection || 'Ziel'}`]);
    for (const c of extra.criteria || []) w(root, ['item', id, `--text=${c}`]);
    for (const s of extra.plan || []) w(root, ['item', id, '--section=Umsetzungsplan', `--text=${s}`]);
    for (const n of extra.done || []) w(root, ['check', id, String(n)]);
    for (const q of extra.questions || []) w(root, ['question', id, `--text=${q}`]);
    if (extra.image) w(root, ['asset', id, img(extra.image[0]), `--kind=${extra.image[1]}`, `--desc=${extra.image[2]}`]);
    return id;
  };

  add('roles', ['--type=feature', '--title=Rollen-Listen als Baukasten im Dashboard', '--priority=P1', '--effort=L', '--tags=bot,dashboard,ui', '--milestone=M1'], {
    goal: 'Staff- und Team-Listen werden im Dashboard aus Bausteinen zusammengesetzt, statt fest im Code zu stehen.',
    criteria: ['Rollen per Drag and Drop sortierbar', 'Mitgliederzahl je Rolle sichtbar', 'Änderungen landen ohne Neustart im Bot'],
    plan: ['Datenmodell für Listen anlegen', 'Editor im Dashboard bauen', 'Bot liest Listen beim Posten'], done: [1, 2],
    image: ['roles', 'mockup', 'Editor mit fünf Rollen von Owner bis Team, je Zeile Farbpunkt, Name und Mitgliederzahl.'],
  });
  add('backup', ['--type=bug', '--title=Backups im Bot-Dashboard bleiben leer', '--priority=P1', '--effort=S', '--tags=bot,dashboard'], {
    goal: 'Die Backup-Seite zeigt keine Einträge, obwohl der nächtliche Job läuft.', goalSection: 'Zusammenfassung',
    criteria: ['Backups der letzten 7 Tage werden gelistet', 'Fehlerfall zeigt eine verständliche Meldung'],
    questions: ['Werden Backups lokal oder in S3 gespeichert?'],
    image: ['error', 'fehler', 'Fehlermeldung "Backup fehlgeschlagen" mit ENOENT für backups/2026-10-29.json.'],
  });
  add('maint', ['--type=chore', '--title=Wartungsmodus mit Zeitstrahl ausrollen', '--priority=P1', '--effort=M', '--tags=deploy,server,webseite', '--milestone=M1'], {
    goal: 'Wartungsfenster werden auf Webseite und im Bot mit Zeitstrahl angekündigt.', goalSection: 'Beschreibung',
    criteria: ['Banner auf der Webseite', 'Statusnachricht im Discord', 'Automatisches Ende nach Ablauf'],
  });
  add('apply', ['--type=feature', '--title=Bewerbungssystem: Annahme zurücknehmen und eigener Kanal je Bewerbung', '--priority=P2', '--effort=L', '--tags=bot', '--milestone=M1'], {
    goal: 'Moderatoren können eine Annahme zurücknehmen, und jede Bewerbung bekommt einen eigenen Kanal.',
    criteria: ['Annahme lässt sich innerhalb von 24 Stunden zurücknehmen', 'Kanal wird beim Abschluss archiviert'],
  });
  add('rank', ['--type=feature', '--title=Rangrollen auch bei /rank me vergeben', '--priority=P3', '--effort=S', '--tags=bot', '--milestone=M1'], {
    goal: 'Wer /rank me nutzt, bekommt sofort die passende Rangrolle.',
    criteria: ['Rolle wird vergeben', 'Alte Rangrolle wird entfernt'], done: [1, 2],
  });
  add('bracket', ['--type=design', '--title=Turnierseite: Bracket-Ansicht für Mobilgeräte', '--priority=P2', '--effort=M', '--tags=ui,webseite', '--milestone=M2', '--due=2026-10-27'], {
    goal: 'Das Turnier-Bracket ist auf dem Handy ohne seitliches Scrollen lesbar.',
    criteria: ['Runden als wischbare Spalten', 'Eigenes Team hervorgehoben'],
    image: ['bracket', 'mockup', 'Bracket mit drei Runden: vier, zwei und ein Match, das Finale ist farbig umrandet.'],
  });
  add('limiter', ['--type=debt', '--title=Rate Limiter provisorisch im Speicher', '--priority=P3', '--effort=M', '--tags=bot', `--blocked-by=${tasks.backup}`], {
    goal: 'Der Rate Limiter für Slash Commands hält seinen Zustand nur im Arbeitsspeicher.', goalSection: 'Abkürzung',
  });
  add('redis', ['--type=spike', '--title=Prüfen, ob Redis für Sessions reicht', '--priority=P4', '--effort=S'], {
    goal: 'Reicht ein einzelner Redis-Knoten für Sessions und Rate Limits bei 5000 gleichzeitigen Nutzern?', goalSection: 'Forschungsfrage',
  });
  add('login', ['--type=feature', '--title=Discord Login für die Turnier-Anmeldung', '--priority=P2', '--effort=M', '--tags=webseite', '--milestone=M2', '--status=geplant'], {
    goal: 'Teams melden sich mit ihrem Discord-Konto an, ohne eigenes Passwort.',
    criteria: ['OAuth2 Login', 'Teamleitung wird aus der Discord-Rolle übernommen'],
  });
  add('logs', ['--type=chore', '--title=Logausgaben vereinheitlichen', '--priority=P4', '--effort=S', '--tags=bot,server']);
  add('dark', ['--type=feature', '--title=Farbschema im Dashboard umschaltbar', '--priority=P3', '--effort=S', '--tags=dashboard,ui', '--incomplete']);

  w(root, ['start', tasks.maint]);
  w(root, ['handoff', tasks.maint, '--text=Banner auf der Webseite steht. Nächster Schritt: Statusnachricht im Bot, Datei src/events/maintenance.ts.']);
  w(root, ['check', tasks.maint, '1']);
  w(root, ['set', tasks.roles, 'status=review']);
  w(root, ['start', tasks.rank]);
  w(root, ['done', tasks.rank, '--confirm']);
  w(root, ['idea', '--text=Leaderboard mit Wochenranking', '--tags=dashboard']);
  w(root, ['idea', '--text=Turnierkalender als iCal exportieren']);
  w(root, ['idea', '--text=Statistiken je Spieler nach jedem Match']);
  // Bereits früher erledigte Arbeit, damit Fortschritt und Verlauf etwas zeigen.
  for (const [title, type] of [['Bot auf discord.js 14 migriert', 'refactor'], ['Datenbank auf PostgreSQL mit Prisma umgestellt', 'chore'], ['Verifizierung über Forum-Tickets', 'feature']]) {
    const id = newId(w(root, ['new', `--type=${type}`, `--title=${title}`, '--priority=P2', '--effort=M', '--tags=bot']));
    w(root, ['start', id]);
    w(root, ['done', id, '--confirm', '--force', '--reason=Demo']);
    tasks[`old-${id}`] = id;
  }
  // Neuere Funktionen zum Ausprobieren: Sprint, Abhängigkeiten, Kommentare, Vorlage, Ansicht, Prüfungen, Zeit.
  w(root, ['link', tasks.backup, 'blocks', tasks.apply]);
  w(root, ['sprint', 'start', '--title=Backups und Rollen live', '--goal=Backups sichern Rollen und Rechte, Rollen-Listen sind fertig', `--start=${addDays(new Date().toLocaleDateString('sv-SE'), -3)}`]);
  w(root, ['sprint', 'add', [tasks.roles, tasks.maint, tasks.backup, tasks.login].filter(Boolean).join(',')]);
  w(root, ['comment', tasks.backup, '--as=Nutzer', '--text=Bitte Kanäle, die beim Laden schon existieren, nicht doppelt anlegen.']);
  w(root, ['comment', tasks.backup, '--as=Claude', '--text=Verstanden. Vor dem Laden vergleiche ich die Kanäle nach Name und Kategorie. Sollen Kanal-Webhooks mitgesichert werden? Sie enthalten Tokens.']);
  const tpl = path.join(root, '.works', '.tmp', 'tpl.json');
  fs.mkdirSync(path.dirname(tpl), { recursive: true });
  fs.writeFileSync(tpl, JSON.stringify({
    name: 'Neuer Slash-Befehl', title: '/{Befehl}: ', type: 'feature', priority: 'P3', effort: 'S', tags: ['bot', 'command'],
    fields: [{ key: 'Befehl', kind: 'text', required: true }, { key: 'Rechte', kind: 'choice', options: ['alle', 'Mods', 'Admins'], required: true }],
    description: 'Der Befehl /{Befehl} wird in src/commands registriert. Berechtigung: {Rechte}.',
    hints: 'Optionen mit Zod prüfen und Antworten nach 3 Sekunden deferren.',
    criteria: [{ text: 'Befehl /{Befehl} ist registriert und wird beim Start deployt', mode: 'always' }, { text: 'Fehlende Rechte führen zu einer ephemeren Fehlermeldung', mode: 'always' }, { text: 'Befehl steht in der Hilfe', mode: 'default' }, { text: 'Rate Limit pro Nutzer', mode: 'optional' }],
  }));
  w(root, ['template', 'save', `--file=${tpl}`]);
  const cfgFile = path.join(root, '.works', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  cfg.views = [{ name: 'Dringend', filter: { prios: ['P1', 'P2'], type: '', tag: '', ms: '', signal: 'unblocked', q: '', closed: false }, view: 'board', sort: null }];
  cfg.checks = { lint: 'node -e "console.log(\'lint ok\')"', test: 'node -e "console.log(\'12 Tests bestanden\')"', audit: 'skill:code-audit' };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  const events = [];
  const now = Date.now();
  for (const [a, b] of [[-26 * 60, -25 * 60 + 40], [-25 * 60 + 50, -24 * 60 + 30], [-5 * 60, -3 * 60 - 20], [-60, -15]]) {
    events.push({ t: new Date(now + a * 60000).toISOString(), ev: 'start', task: tasks.maint, s: 'demo' }, { t: new Date(now + b * 60000).toISOString(), ev: 'stop', task: tasks.maint, s: 'demo' });
  }
  fs.writeFileSync(path.join(root, '.works', 'time.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  backdate(root);
  fs.rmSync(path.join(root, '.works', '.tmp'), { recursive: true, force: true });
  return tasks;
}

// Verteilt Anlage- und Abschlussdaten über die letzten Wochen, nur für die Demo.
function backdate(root) {
  const shift = (days) => { const d = new Date(today() + 'T00:00:00'); d.setDate(d.getDate() - days); return d.toLocaleDateString('sv-SE'); };
  const plan = { 'W-0001': 40, 'W-0002': 12, 'W-0003': 30, 'W-0004': 26, 'W-0005': 33, 'W-0006': 19, 'W-0007': 15, 'W-0008': 9, 'W-0009': 22, 'W-0010': 6, 'W-0011': 3, 'W-0012': 55, 'W-0013': 52, 'W-0014': 47 };
  const done = { 'W-0005': 4, 'W-0012': 38, 'W-0013': 24, 'W-0014': 11 };
  for (const t of loadTasks(root)) {
    if (plan[t.id] === undefined) continue;
    t.created = shift(plan[t.id]);
    if (done[t.id] !== undefined) t.completed = shift(done[t.id]);
    saveTask(t, { touch: false });
  }
}

// Spielt nacheinander Änderungen vor, wie Claude sie während der Arbeit macht.
export async function simulate(root, tasks, { delay = 6000, log = console.log } = {}) {
  const steps = [
    ['Claude startet die Arbeit an der Bracket-Ansicht', ['start', tasks.bracket]],
    ['Ein Akzeptanzkriterium wird abgehakt', ['check', tasks.bracket, '1']],
    ['Claude notiert eine Frage an dich', ['question', tasks.bracket, '--text=Soll das eigene Team auch in der Desktop-Ansicht hervorgehoben werden?']],
    ['Wartungsmodus geht in die Prüfung', ['set', tasks.maint, 'status=review']],
    ['Eine neue Aufgabe entsteht aus einem Fund im Code', ['new', '--type=bug', '--title=Bracket bricht bei Teamnamen über 24 Zeichen', '--priority=P2', '--effort=S', '--tags=ui,webseite']],
    ['Priorität wird angehoben', ['set', tasks.apply, 'priority=P1', '--reason=Wird vor dem Livegang gebraucht']],
    ['Rollen-Listen werden nach Prüfung abgeschlossen', ['done', tasks.roles, '--confirm', '--force', '--reason=Demo: letzter Punkt wird nach dem Livegang erledigt']],
    ['Die geplante Login-Aufgabe wird gestartet', ['start', tasks.login]],
    ['Claude schreibt eine Übergabe', ['handoff', tasks.login, '--text=OAuth2 App angelegt. Nächster Schritt: Callback-Route in src/routes/auth.ts.']],
    ['Ein Spike wird verworfen', ['drop', tasks.redis, '--reason=Entscheidung für einen verwalteten Redis-Dienst']],
  ];
  for (const [text, args] of steps) {
    await sleep(delay);
    try { w(root, args); log(`  ${text}`); } catch (e) { log(`  ${text}: übersprungen (${String(e.stderr || e.message).split('\n')[0]})`); }
  }
}

export function defaultDemoPath() {
  return path.join(os.tmpdir(), 'works-demo');
}
