// Szenario für works shot --scenario (W-0035): Zwei Boards laufen, in Trainingsplan wartet Claude auf eine Freigabe.
// Aufgenommen wird der Hub mit der Einladung zu Browser-Hinweisen (W-0028).
//   works shot --scenario references/scenarios/freigabe-im-hub.mjs --widths=1440,390 --themes=light,dark
export default {
  name: 'freigabe-im-hub',
  async setup(kit) {
    const a = kit.project('mycron', [{ title: 'Hub: Hinweis bei Freigabe', priority: 'P3' }, { title: 'Skill ship', priority: 'P2' }]);
    const b = kit.project('Trainingsplan', [{ title: 'Trainingsseite fürs Handy', priority: 'P2' }]);
    kit.works(b, ['start', 'W-0001']);
    kit.hook(b, 'permission.mjs', { tool_name: 'Bash', tool_input: { command: 'npm install -D vitest' } });
    const url = await kit.board(a);
    await kit.board(b);
    return { url: `${url}hub` };
  },
  async prepare(page) {
    await page.waitForSelector('.hub-bc');
  },
};
