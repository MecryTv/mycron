# mockups

> English. Deutsche Fassung: [README.de.md](README.de.md)

A skill for design tasks: build variants as HTML mockups with the project's real styles, capture them at three widths in light and dark, check them for errors and present them for you to choose. With [works](../works/README.md) it attaches the mockups to the task; without works they stay as files in the project.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install mockups@mycron
```

The screenshots need Node 18 or newer, an installed Chrome (or Edge) and Playwright. If Playwright is missing, the script names the command for it: `npm install -g playwright`. Playwright does not download any browsers for this: the script uses Chrome, otherwise Edge, otherwise Playwright's Chromium. A different browser, for example `/usr/bin/chromium`, is set with `ENTWURF_BROWSER=<path>`.

## Triggers

"Show me mockups", "make two variants", "what could this look like", design tasks in works, or screenshots of a page at several widths.

## Contents

- `skills/mockups/vorlage.html`: mockup page with a frame for switching variants and light/dark. `?v=B`, `?theme=dark` and `?frame=0` also control it through the URL.
- `skills/mockups/scripts/entwurf.mjs shots <page.html> [--variants A,B] [--widths 1440,768,390] [--themes light,dark] [--out folder]`: one screenshot per variant, color scheme and width. Reports horizontal scrolling with the elements that stick out, page errors, console errors and files that did not load. Exit 0 without problems, 1 with problems, 2 for a wrong call or missing Playwright.
- `skills/mockups/scripts/entwurf.mjs inline <page.html> [--variant B] [--out file.html]`: embeds local CSS, fonts and images as `data:` and sets the starting variant. Needed for the works board, which shows mockups in a sandboxed iframe.
