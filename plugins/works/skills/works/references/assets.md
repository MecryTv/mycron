# Images and assets

## The technical limitation

An image the user pastes or drags into the chat in Claude Code exists only in the context. Claude can look at it but cannot save it as a file, because the binary data is not accessible. So never claim a pasted image has been saved unless a file was actually copied.

There are three ways to get an image into `assets/`.

### 1. File path

The user names the path or drags the file into the terminal, which puts the path in the prompt. Common places to ask about: `~/Bilder/Bildschirmfotos/`, `~/Pictures/Screenshots/`, `~/Downloads/`.

```
works asset W-0012 ~/Pictures/Screenshots/2026-10-29_19-02.png --kind before \
  --desc "Login page before the redesign. Form left-aligned, logo 24 px, no dark mode, errors as a toast top right."
```

Without `--move` the file is copied and the original stays.

### 2. Inbox

The user drops screenshots into `.works/inbox/`, for example by setting the screenshot tool to save there. On the next call:

```
works inbox
works asset W-0012 screenshot.png --kind error --desc "..."
```

Files from the inbox are moved, not copied. Before assigning an image, look at it with Read so the description is accurate, and if it is unclear, ask the user which task it belongs to.

### 3. Screenshots you take yourself

`works shot` takes screenshots with the installed Chrome via Playwright and can attach them to the task right away:

```
works shot --url http://localhost:5173/login --widths 1440,390 --themes light,dark --asset W-0012 --kind before --desc "Login before the change"
works shot live --widths 390 --themes dark        # one view of the works board
works shot W-0012                                 # the detail view of a task in the board
```

1. Before the first change: capture the page with `--asset <ID> --kind before`.
2. After the implementation: same URL, same widths and color schemes, `--kind after`.
3. Look at the images with Read. `works shot` also reports horizontal scrolling, page and console errors, and files that failed to load (exit 1).

Without `--asset` the images go to `.works/.tmp/shots/` (not in Git) or to `--out`. If Playwright is missing, the command prints the install command (exit 2); it never downloads browsers. Set a different browser with `WORKS_BROWSER=<path>`.

## Naming

The CLI names files automatically: `YYYY-MM-DD-<slug>[-<kind>].<ext>`, with a counter on collisions. The slug comes from `--name`, otherwise from `--alt`, otherwise from the first sentence of `--desc`.

`--kind` takes the English names below. The files store the German value, which also ends up in the file name.

| `--kind` | Stored as | Use |
|---|---|---|
| current | ist | Current state, no change planned |
| before | vorher | State before a change, counterpart to after |
| after | nachher | Result after the change |
| reference | referenz | Model, inspiration, brand guideline |
| mockup | mockup | Draft, wireframe, generated design |
| sketch | skizze | Hand drawing, whiteboard |
| error | fehler | Error state, error message |
| diagram | diagramm | Architecture, flow, data model |

For the DoD check on UI tasks, files ending in `-vorher` or `-ist` and in `-nachher` count.

## Description

Every image gets three lines in task.md:

```
![Login page before the redesign](assets/2026-10-29-login-page-before-the-redesign-vorher.png)
Description: Login page before the redesign. Form left-aligned, logo 24 px, no dark mode, errors as a toast top right.
Kind: vorher · Added: 2026-10-29
```

Write the description so that a later session does not need to open the image to know what it shows: layout, notable elements, colors, texts, error messages verbatim. Only load the image with Read when details are missing. That saves context.

`works doctor` reports images without a description line, missing files, and files in `assets/` that nothing links to.

## Other files

PDFs, videos and other files work the same way and are included as a normal link instead of an image.

## Compression

Requires `sharp` as a dev dependency in the project (`npm i -D sharp`). Do not install anything in the plugin folder itself; it is replaced on every update.

```
works asset <ID> <path> --desc "..." --compress
works compress            # all tasks
works compress W-0012     # one task
```

Width and quality are set in `config.json` under `assets`. With `assets.compress_on_add: true` every new image is compressed automatically. Without sharp nothing is changed.

## Git

With many large images use `works init --gitignore assets`, or add `tasks/*/assets/` to `.works/.gitignore` later. Alternatively set up Git LFS for `*.png` in the `.works/` folder.
