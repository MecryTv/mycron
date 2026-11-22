// Szenario für works shot --scenario (W-0035): Eine Aufgabe im Review mit gewähltem Entwurf und Nachher-Bild.
// Aufgenommen wird der Abnahmedialog, Entwurf und Ergebnis im gleichen Maßstab (W-0030).
//   works shot --scenario references/scenarios/abnahme.mjs --widths=1440 --themes=light
export default {
  name: 'abnahme',
  async setup(kit) {
    const d = kit.project('mycron', [{ title: 'Neue Startseite', priority: 'P3', type: 'design' }]);
    const design = kit.file('entwurf.html', `<!doctype html><html lang="de"><body style="margin:0;font:16px system-ui">
<script>const t = new URLSearchParams(location.search).get('theme') === 'dark';
document.body.style.background = t ? '#141a24' : '#f3f5f8'; document.body.style.color = t ? '#e6eaf2' : '#18202c';</script>
<header style="padding:24px 32px;background:#5550d9;color:#fff;font-size:24px;font-weight:700">Neue Startseite</header>
<main style="padding:32px;display:grid;gap:16px"><p>Entwurf A: großer Kopf, darunter drei Kacheln.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
<div style="height:120px;border-radius:12px;background:#5550d922"></div><div style="height:120px;border-radius:12px;background:#5550d922"></div><div style="height:120px;border-radius:12px;background:#5550d922"></div></div></main></body></html>`);
    kit.works(d, ['design', 'add', 'W-0001', '--name', 'A', '--title', 'Großer Kopf', '--file', design]);
    kit.works(d, ['design', 'choose', 'W-0001', 'A', '--reason', 'Szenario']);
    const url = await kit.board(d);
    // Das Ergebnis ist hier der Entwurf selbst, aufgenommen mit works shot (Name mit -light-1440 für den Vergleich).
    kit.works(d, ['shot', `--url=${design}`, '--widths=1440', '--themes=light', '--name=startseite', '--asset=W-0001', '--kind=nachher', '--desc=Startseite'], { env: kit.realProfile });
    kit.works(d, ['set', 'W-0001', 'status=review']);
    return { url };
  },
  async prepare(page) {
    await page.click('.card[data-id="W-0001"]');
    await page.click('[data-act="review"]');
    await page.waitForSelector('dialog[open] .rv-cmp');
    await page.waitForTimeout(800);
  },
};
