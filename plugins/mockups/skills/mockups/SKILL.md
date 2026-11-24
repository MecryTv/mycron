---
name: mockups
description: Use when design variants, alternatives or an HTML mockup should be shown for a design task, using the project's real styles, light and dark, on desktop, tablet and phone, or when a design variant is attached to a works task (works design add). Also for screenshots of a page at several widths and checking for horizontal scrolling.
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`; without works: `"language": "de"` in `.works/config.json` or `~/.works/settings.json`), read [SKILL.de.md](SKILL.de.md) instead and answer the user in German. For any other language, use these English docs and answer in that language.

# Mockups

Two tools that stay the same for every design task:

- `${CLAUDE_SKILL_DIR}/vorlage.html`: mockup page with a switcher frame for variants and light/dark
- `node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs"`: `shots` takes the screenshots with the installed Chrome and checks them, `inline` embeds CSS, fonts and images

No screenshot script of your own, no generator of your own: both already exist here.

## Steps

1. **Read the basis.** Which CSS file(s) does the real interface load? What does the markup of the affected part look like in the code (template, component, render function)? With works, also the task description and earlier design decisions; the works skill's rules for design tasks still apply.
2. **Build the mockup page.** Copy `vorlage.html` into the working folder and fill it in:
   - Working folder with works: in the temp directory (`mockup-<topic>/`); only the attached copy goes into the repo. Without works: `mockups/<topic>/` in the project, do not commit.
   - Point the `<link>` at the real CSS file, relative to the working folder or as `file:///`. The whole file, never copied excerpts: those go stale with the next change.
   - One `<section data-ew-variant="A" data-ew-note="...">` per variant with the markup from the code. Two or three variants; "Today" (the current state) as its own variant helps with the comparison.
   - Styles for one variant only: `html[data-v="B"] .card { ... }`. Your own classes get the prefix `ew-`.
   - Write the file with the Write tool, not through a heredoc, `node -e` or template strings: there `\` and `$` get lost and regexes break silently.
3. **Screenshots and checks.**
   ```
   node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs" shots <page.html> --variants A,B
   ```
   Default: 1440, 768 and 390 px, each light and dark, stored in `<page>-shots/`. Fix every `PROBLEM` line and capture again until "All screenshots without problems" appears. `not loaded: …PROJECT.css` means: the path in the `<link>` is wrong.
   Then look at the images yourself (Read on the PNG files): every one with a problem, and per variant at least 390 dark and 1440 light. Watch for cut-off text, overlaps and contrast in dark mode.
   Exit 2 with "Playwright missing": give the user the command from the message and do not install it unasked.
4. **Attach.**
   - With works, inline and attach each variant:
     ```
     node "${CLAUDE_SKILL_DIR}/scripts/entwurf.mjs" inline <page.html> --variant A --out <working-folder>/A.html
     works design add <ID> --name A --title "..." --file <working-folder>/A.html --note "..."
     ```
     Without `inline` the variant looks unstyled in the board: the board shows it in an iframe whose security rules load neither `file://` nor relative paths.
     Exit 1 with `not inlined: …` means: this reference could not be resolved and stays as it is. Check each one: a placeholder with a replacement rule (see Pitfalls) is harmless, a missing file is not.
   - Without works, page and screenshots stay in the working folder.
5. **Show.** Open the original page in the default browser: Windows `Start-Process "<path>"`, macOS `open "<path>"`, Linux `xdg-open "<path>"`. With works, also point to the Design variants tab in the board. Message: one sentence per variant, path of the page, folder of the screenshots, open problems, a question about the choice.
6. **Wait for the choice** and only implement after that. With works: `works design choose <ID> <name> --reason "..."`.

## Pitfalls

| Pitfall | Remedy |
|---|---|
| Your own class has the same name as one in the project (`.panel`, `.card`, `.box`) and inherits foreign styles | Prefix `ew-`, search the project CSS before using new names |
| Project CSS only reacts to `prefers-color-scheme` | The light/dark button has no effect then, but the screenshots are still correct (the scheme is emulated) |
| Variant unstyled in the works board | `inline` before `works design add` |
| Project CSS contains placeholders that only the server replaces (works board: `url("__FONT__")` in `board.css`) | Keep the `<link>` on the real file and then add your own `@font-face` rule with the real path in the page. Do not create a copy of the CSS |
| Web fonts from Google Fonts | Work everywhere, including the board; `inline` embeds local font files |
