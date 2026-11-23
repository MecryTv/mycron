// Befehle, Hilfe und Dialoge des Discord-Bots works (W-0037). Gemeinsam für den eigenen Bot (discord-bot.mjs) und den
// gemeinsamen Bot (services/works-bot): Discord verlangt eine Antwort in 3 s und Dialoge lassen sich nicht vorläufig
// beantworten, deshalb öffnet sie beim gemeinsamen Bot der Dienst selbst. Ohne Abhängigkeiten und ohne Dateizugriff.

export const isDe = (locale) => String(locale || '').toLowerCase().startsWith('de');
export const tr = (locale) => (de, en) => (isDe(locale) ? de : en);
export const DOCS = 'https://github.com/MecryTv/mycron/blob/main/plugins/works/skills/works/references/integrations.md#discord';

// custom_id an Knöpfen und Dialogen: w:<aktion>:<projekt>:<aufgabe>. Projekt ist die rootId (16 hex), Aufgabe eine ID
// wie W-0037, beides darf fehlen. Aktionen: acc annehmen, ret zurück an Claude, ins Anweisung, new neue Aufgabe,
// bug Bug ansehen. Antworten aus einem Dialog tragen die Aktion mit m (retm, insm, newm).
export const CID_RE = /^w:([a-z]{2,8}):([0-9a-f]{0,16}):([A-Za-z]{1,10}-\d{1,6})?$/;
export const MODAL = new Set(['ret', 'ins', 'new']);
export const cid = (act, rid = '', id = '') => `w:${act}:${rid || ''}:${id || ''}`;
export function parseCid(s) {
  const m = String(s || '').match(CID_RE);
  return m ? { act: m[1], rid: m[2], id: m[3] || '' } : null;
}

// Wer hat geklickt oder getippt: im Server steht der Nutzer unter member, in Direktnachrichten unter user.
export const who = (i) => String((i && i.member && i.member.user && i.member.user.id) || (i && i.user && i.user.id) || '');
export const subOf = (i) => {
  const s = (i && i.data && Array.isArray(i.data.options) && i.data.options[0]) || null;
  return { sub: (s && s.name) || '', opts: Object.fromEntries(((s && s.options) || []).map((o) => [o.name, String(o.value ?? '').trim()])) };
};
export const modalValues = (data) => Object.fromEntries(((data && data.components) || []).flatMap((r) => r.components || []).map((c) => [c.custom_id, String(c.value ?? '').trim()]));

const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- Befehle ----------

const opt = (type, name, de, en, enDe, extra = {}) => ({ type, name, ...(de && de !== name ? { name_localizations: { de } } : {}), description: en, description_localizations: { de: enDe }, ...extra });
const PRIOS = [['P1', 'critical', 'kritisch'], ['P2', 'high', 'hoch'], ['P3', 'medium', 'mittel'], ['P4', 'low', 'niedrig']]
  .map(([v, en, de]) => ({ name: `${v} ${en}`, name_localizations: { de: `${v} ${de}` }, value: v }));
const project = () => opt(3, 'project', 'projekt', 'Project name, only needed with several projects', 'Name des Projekts, nur bei mehreren Projekten nötig', { max_length: 100 });

// Englische Namen mit deutscher Übersetzung (Entwurf HS). Unterbefehle verbinden und trennen nur beim gemeinsamen Bot.
// default_member_permissions 32: nur sichtbar für Leute mit „Server verwalten“; was der Bot tut, prüft er trotzdem selbst.
export function commands({ shared = false } = {}) {
  const subs = [
    opt(1, 'help', 'hilfe', 'What works does and all commands', 'Was works tut und alle Befehle'),
    opt(1, 'status', '', 'Status of all projects or of one project', 'Stand aller Projekte oder eines Projekts', { options: [project()] }),
    opt(1, 'tasks', 'aufgaben', 'Open tasks by priority', 'Offene Aufgaben nach Priorität', { options: [project()] }),
    opt(1, 'new', 'neu', 'Note a new task', 'Neue Aufgabe notieren', { options: [
      opt(3, 'title', 'titel', 'Title of the task', 'Titel der Aufgabe', { required: true, max_length: 160 }),
      opt(3, 'priority', 'priorität', 'P1 critical to P4 low', 'P1 kritisch bis P4 niedrig', { required: true, choices: PRIOS }),
      project(),
    ] }),
    opt(1, 'instruct', 'anweisung', 'Instruction for Claude, arrives with the next step', 'Anweisung an Claude, kommt beim nächsten Schritt an', { options: [
      opt(3, 'text', '', 'What Claude should do', 'Was Claude tun soll', { required: true, max_length: 4000 }),
      project(),
      opt(3, 'task', 'aufgabe', 'Task ID, otherwise the task in progress', 'Aufgaben-ID, sonst die Aufgabe in Arbeit', { max_length: 20 }),
    ] }),
  ];
  if (shared) {
    subs.push(opt(1, 'link', 'verbinden', 'Get a one-time code to link works to this channel', 'Einmaligen Code erzeugen, um works mit diesem Kanal zu koppeln'));
    subs.push(opt(1, 'unlink', 'trennen', 'Disconnect all devices from this channel', 'Alle Geräte in diesem Kanal trennen'));
  }
  return [{ name: 'works', type: 1, contexts: [0], default_member_permissions: '32', description: 'Control works and see what Claude is doing', description_localizations: { de: 'works steuern und sehen, was Claude tut' }, options: subs }];
}

// ---------- Hilfe (Entwurf HS) ----------

// devices: beim gemeinsamen Bot die gekoppelten Geräte des Servers als fertige Zeilen.
export function helpMessage({ locale, shared = false, devices = null } = {}) {
  const t = tr(locale);
  const c = (en, de) => `/works ${t(de, en)}`;
  const lines = [
    [c('status', 'status'), t('Stand aller Projekte oder eines Projekts', 'Status of all projects or one project')],
    [c('tasks', 'aufgaben'), t('Offene Aufgaben nach Priorität', 'Open tasks by priority')],
    [c('new', 'neu'), t('Aufgabe notieren (Titel, Priorität)', 'Note a task (title, priority)')],
    [c('instruct', 'anweisung'), t('Anweisung an Claude, kommt beim nächsten Schritt an', 'Instruction for Claude, arrives with the next step')],
  ];
  if (shared) {
    lines.push([c('link', 'verbinden'), t('works mit diesem Kanal koppeln (Server verwalten)', 'Link works to this channel (Manage Server)')]);
    lines.push([c('unlink', 'trennen'), t('Geräte in diesem Kanal trennen', 'Disconnect the devices in this channel')]);
  }
  const fields = [
    { name: t('Befehle', 'Commands'), value: lines.map(([k, v]) => `\`${k}\` ${v}`).join('\n'), inline: false },
    { name: t('Knöpfe', 'Buttons'), value: t('Annehmen, Zurück an Claude, Anweisung an Claude, Bug ansehen. Nur du kannst sie benutzen.', 'Accept, Back to Claude, Instruction for Claude, View bug. Only you can use them.'), inline: false },
    { name: t('Klingeln', 'Pings'), value: t('Nur wenn Claude dich braucht, nachts still.', 'Only when Claude needs you, quiet at night.'), inline: true },
    { name: t('Datenschutz', 'Privacy'), value: t('Befehle aus Freigaben nie, Kosten abschaltbar.', 'Never commands from approvals, costs can be hidden.'), inline: true },
    { name: t('Einstellungen', 'Settings'), value: t('Im Board unter Werkzeuge · Discord-Bot oder mit `works discord set`.', 'In the board under Tools · Discord bot or with `works discord set`.'), inline: false },
  ];
  if (devices) fields.push({ name: t('Gekoppelte Geräte', 'Linked devices'), value: short(devices.length ? devices.join('\n') : t('Keine.', 'None.'), 1024), inline: false });
  return {
    embeds: [{
      color: 0x5865f2,
      title: t('works · Hilfe', 'works · Help'),
      description: t('works meldet dir hier, was Claude in deinen Projekten tut: eine angeheftete Übersicht, Hinweise, wenn Claude dich braucht, Reviews, Auslieferungen und rote CI.', 'works tells you here what Claude is doing in your projects: a pinned overview, a ping when Claude needs you, reviews, deliveries and red CI.'),
      fields,
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: t('Anleitung', 'Guide'), url: DOCS }] }],
  };
}

// ---------- Dialoge ----------

const input = (custom_id, label, style, extra = {}) => ({ type: 1, components: [{ type: 4, custom_id, label: short(label, 45), style, ...extra }] });

// Dialog zu einem Knopf, oder null, wenn der Knopf keinen öffnet.
export function modalFor(customId, locale) {
  const p = parseCid(customId);
  if (!p || !MODAL.has(p.act)) return null;
  const t = tr(locale);
  if (p.act === 'ret') {
    return { custom_id: cid('retm', p.rid, p.id), title: short(t(`${p.id} zurück an Claude`, `${p.id} back to Claude`), 45),
      components: [input('text', t('Was fehlt oder stört?', 'What is missing or wrong?'), 2, { required: true, min_length: 3, max_length: 4000 })] };
  }
  if (p.act === 'ins') {
    return { custom_id: cid('insm', p.rid, p.id), title: short(p.id ? t(`Anweisung an Claude (${p.id})`, `Instruction for Claude (${p.id})`) : t('Anweisung an Claude', 'Instruction for Claude'), 45),
      components: [input('text', t('Anweisung', 'Instruction'), 2, { required: true, max_length: 4000, placeholder: t('Kommt bei Claude an, sobald es den nächsten Schritt macht.', 'Reaches Claude with its next step.') })] };
  }
  return { custom_id: cid('newm', p.rid, ''), title: t('Neue Aufgabe', 'New task'),
    components: [
      input('title', t('Titel', 'Title'), 1, { required: true, max_length: 160 }),
      input('priority', t('Priorität: P1, P2, P3 oder P4', 'Priority: P1, P2, P3 or P4'), 1, { required: true, min_length: 2, max_length: 2, placeholder: t('P1 kritisch … P4 niedrig', 'P1 critical … P4 low') }),
    ] };
}

// Antwort nur für den Aufrufer, ohne Erwähnungen.
export const ephemeral = (data) => ({ ...data, flags: 64, allowed_mentions: { parse: [] } });
export const notOwner = (locale) => ephemeral({ embeds: [{ color: 0x80848e, title: tr(locale)('Nicht für dich', 'Not for you'), description: tr(locale)('works hört nur auf die Person, die es eingerichtet hat. Du kannst die Nachrichten lesen, aber nichts auslösen.', 'works only listens to the person who set it up. You can read the messages but not trigger anything.') }] });
