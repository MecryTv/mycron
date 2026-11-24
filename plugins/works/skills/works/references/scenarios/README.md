# Scenarios for works shot

`works shot --scenario <file.mjs> [--widths 1440,390] [--themes light,dark] [--name ..] [--out folder]` sets up a state before each capture, takes the screenshot and cleans up afterwards. Meant for images that `works shot <view>` cannot produce: an orphaned tab, a pending approval in the hub, the acceptance review dialog.

Every width and every scheme gets a fresh setup so states do not interfere with each other. The images go through the same check as with `works shot` (horizontal scrolling, errors on the page, files that failed to load).

## Structure of a scenario file

```js
export default {
  name: 'verwaister-tab',               // file name of the images, otherwise the name of the file
  async setup(kit) {                    // set up the state, return the start URL
    const a = kit.project('mycron', [{ title: 'Hub page', priority: 'P3' }]);
    return { url: await kit.board(a), a };
  },
  async prepare(page, kit, state) {     // optional: click, wait, toggle on the page
    await page.waitForSelector('.card');
  },
};
```

## What the kit can do

| Call | Effect |
|---|---|
| `kit.project(name, tasks)` | Throwaway project with `works init`, tasks as titles or `{ title, priority, type }`. Returns the folder |
| `kit.works(folder, args, { env })` | works command in the project, throws on errors. `env: kit.realProfile` for commands that start Chrome themselves (such as `works shot`) |
| `await kit.board(folder, { port })` | Starts the board on a free port (from 49300) or the given one, returns the URL |
| `kit.stop(folder)` | Stops the board |
| `kit.hook(folder, 'permission.mjs', input)` | Triggers a works hook, such as a pending approval |
| `kit.file(name, content)` | Creates a file in the throwaway folder, returns the path |
| `kit.dir` | The throwaway folder |

The kit uses its own HOME: the projects do not end up in the real project list and no browser opens. At the end it stops all boards of its projects and deletes the folder, even if `setup` fails.

A scenario file is executable code. Only use your own or reviewed files.

## Examples

- `verwaister-tab.mjs`: a board ends, another project starts on its port (W-0029)
- `freigabe-im-hub.mjs`: two boards, in one of them Claude is waiting for an approval (W-0028)
- `abnahme.mjs`: task in review with a chosen design variant and an after image (W-0030)
