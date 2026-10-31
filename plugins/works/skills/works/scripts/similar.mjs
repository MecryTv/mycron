// Ähnliche offene Aufgaben finden, um Duplikate beim Anlegen zu vermeiden.
const STOP = new Set(['der', 'die', 'das', 'und', 'oder', 'für', 'mit', 'von', 'im', 'in', 'am', 'an', 'auf', 'zu', 'zum', 'zur', 'ein', 'eine', 'einen', 'bei', 'als', 'aus', 'ist', 'wird', 'the', 'and', 'for', 'of', 'to', 'a']);

export function tokens(text) {
  return [...new Set(String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9äöüß]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(en|er|e|n|s)$/, '')))];
}

// Ähnlichkeit 0 bis 1 aus Titelwörtern (stark), Tags und Beschreibung (schwächer).
export function similarity(a, b) {
  const ta = tokens(a.title); const tb = tokens(b.title);
  if (!ta.length || !tb.length) return 0;
  const inter = ta.filter((w) => tb.includes(w)).length;
  const title = inter / Math.min(ta.length, tb.length);
  const tagsA = a.tags || []; const tagsB = b.tags || [];
  const tags = tagsA.length && tagsB.length ? tagsA.filter((x) => tagsB.includes(x)).length / Math.max(tagsA.length, tagsB.length) : 0;
  const da = tokens(a.text || ''); const db = tokens(b.text || '');
  const desc = da.length && db.length ? da.filter((w) => db.includes(w)).length / Math.min(da.length, db.length, 20) : 0;
  return Math.min(1, title * 0.7 + tags * 0.15 + Math.min(1, desc) * 0.15);
}

export function findSimilar(candidate, tasks, { min = 0.5, open = ['backlog', 'geplant', 'in-arbeit', 'review'] } = {}) {
  return tasks.filter((t) => open.includes(t.status) && t.id !== candidate.id)
    .map((t) => ({ t, score: similarity(candidate, t) })).filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score).slice(0, 3);
}
