// Szenarien für works shot (W-0035): einen Zustand in Wegwerf-Projekten herstellen, dann aufnehmen.
// Eine Szenario-Datei (.mjs) exportiert { name?, setup(kit) -> { url, ... }, prepare?(page, kit, state) }.
// Das kit übernimmt den immer gleichen Teil: eigenes HOME, freie Ports, works-Befehle, Hooks und das Aufräumen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR } from './lib.mjs';
import { tr } from './i18n.mjs';

const freePort = (p) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(p, '127.0.0.1');
});

export function scenarioKit({ cli }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'works-szenario-'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  // Eigenes HOME: Projekte landen nicht in der echten Projektliste. Kein Browser öffnet sich (WORKS_DRY_OPEN).
  const env = { ...process.env, HOME: home, USERPROFILE: home, WORKS_DRY_OPEN: '1', WORKS_ACTOR: '' };
  const projects = [];
  const kit = {
    dir,
    // Für Befehle, die selbst Chrome starten (etwa works shot): Chrome stürzt unter Windows mit fremdem USERPROFILE ab.
    realProfile: { HOME: process.env.HOME || '', USERPROFILE: process.env.USERPROFILE || '' },
    works(cwd, args, { env: extra = null, ok = true } = {}) {
      const r = spawnSync(process.execPath, [cli, ...args], { cwd, env: extra ? { ...env, ...extra } : env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
      if (ok && r.status !== 0) throw new Error(`works ${args.join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
      return r.stdout || '';
    },
    // Projekt mit Aufgaben: Einträge als Titel oder { title, priority, type }.
    project(name, tasks = []) {
      if (!/^[\w .-]+$/.test(name)) throw new Error(tr('Invalid project name: {name}', { name }));
      const d = path.join(dir, name);
      fs.mkdirSync(d);
      kit.works(d, ['init']);
      for (const t of tasks) {
        const o = typeof t === 'string' ? { title: t } : t;
        kit.works(d, ['new', `--type=${o.type || 'feature'}`, `--title=${o.title}`, `--priority=${o.priority || 'P3'}`]);
      }
      projects.push(d);
      return d;
    },
    // Board auf einem freien Port (oder dem angegebenen) starten, gibt die URL zurück.
    async board(cwd, { port } = {}) {
      let p = Number(port) || 0;
      for (let c = 49300 + Math.floor(Math.random() * 400); !p && c < 49800; c++) if (await freePort(c)) p = c;
      if (!p) throw new Error(tr('No free port'));
      kit.works(cwd, ['board', '--serve', '--detach', `--port=${p}`]);
      return `http://127.0.0.1:${p}/`;
    },
    stop(cwd) { kit.works(cwd, ['board', '--stop'], { ok: false }); },
    // Board ohne Ankündigung beenden wie bei einem Absturz (W-0054): Seine Tabs zeigen nicht „beendet“, sondern
    // verbinden sich neu wie bisher. Wartet, bis der Port frei ist.
    async crash(cwd) {
      let info = null;
      try { info = JSON.parse(fs.readFileSync(path.join(cwd, '.works', 'server.json'), 'utf8')); } catch { return; }
      try { process.kill(info.pid); } catch { /* schon weg */ }
      for (let i = 0; i < 50 && !(await freePort(info.port)); i++) await new Promise((r) => setTimeout(r, 100));
    },
    // Hook von works auslösen, etwa permission.mjs für eine wartende Freigabe.
    hook(cwd, file, input = {}) {
      if (!/^[\w-]+\.mjs$/.test(file)) throw new Error(tr('Invalid hook: {file}', { file }));
      spawnSync(process.execPath, [path.join(SKILL_DIR, 'hooks', file)], { cwd, env, input: JSON.stringify({ cwd, session_id: 'szenario', ...input }), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    },
    file(name, content) { const f = path.join(dir, name); fs.writeFileSync(f, content); return f; },
    async cleanup() {
      for (const d of projects) kit.stop(d);
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { await new Promise((r) => setTimeout(r, 300)); }
      }
    },
  };
  return kit;
}

// Lädt die Szenario-Datei und liefert perShot für takeShots: je Aufnahme frischer Aufbau, danach Aufräumen.
export async function loadScenario(file, { cli }) {
  const { pathToFileURL } = await import('node:url');
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  const sc = mod.default || mod;
  if (typeof sc.setup !== 'function') throw new Error(tr('{file} does not export setup(kit).', { file }));
  return {
    name: sc.name || path.basename(file).replace(/\.[^.]+$/, ''),
    perShot: async () => {
      const kit = scenarioKit({ cli });
      let state;
      try { state = await sc.setup(kit); } catch (e) { await kit.cleanup(); throw e; }
      if (!state || !state.url) { await kit.cleanup(); throw new Error(tr('setup(kit) must return { url }.')); }
      return { url: state.url, prepare: sc.prepare ? (page) => sc.prepare(page, kit, state) : null, done: () => kit.cleanup() };
    },
  };
}
