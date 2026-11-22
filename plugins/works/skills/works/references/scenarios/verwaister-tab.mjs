// Szenario für works shot --scenario (W-0035): Das Board von mycron endet, auf seinem Port startet Trainingsplan.
// Der alte Tab zeigt die Leiste „mycron läuft hier nicht mehr“ (W-0029).
//   works shot --scenario references/scenarios/verwaister-tab.mjs --widths=1440,390 --themes=light,dark
export default {
  name: 'verwaister-tab',
  async setup(kit) {
    const a = kit.project('mycron', [
      { title: 'Hub-Seite für alle Boards', priority: 'P3' },
      { title: 'Verwaiste Board-Tabs', priority: 'P2', type: 'bug' },
      { title: 'Skill ship', priority: 'P2' },
    ]);
    const b = kit.project('Trainingsplan', [{ title: 'Trainingsseite fürs Handy', priority: 'P2' }]);
    return { url: await kit.board(a), a, b };
  },
  async prepare(page, kit, { a, b, url }) {
    await page.waitForSelector('.card');
    kit.stop(a);
    await kit.board(b, { port: new URL(url).port });
    await page.waitForSelector('#orphanBar:not([hidden])', { timeout: 15000 });
  },
};
