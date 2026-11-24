# Import from other tools and files

`works import` reads tasks from a file, shows a preview and only creates them with `--apply`. In the board under Tools, Import, with preview and selection.

## Formats

| Format | File | What is recognized |
|---|---|---|
| Trello | JSON export of a board (menu, Print and export, JSON) | Cards, list as status, labels as tags and priority, due date, checklists as criteria (a list with "Acceptance" or "Akzeptanz" in its name, or the first one), further checklists as steps in the description. Archived cards only with `--include-archived` |
| Notion | CSV export of a database, Markdown export, or a ZIP with both | Columns as with CSV, page content as description, properties like `Status: In progress` in the Markdown |
| Linear | CSV export | ID, Title, Description, Status, Priority, Estimate, Labels, Due Date |
| CSV, TSV | any table, also from Jira, Asana, GitHub Projects | Delimiter detected automatically, columns matched by name in English and German |
| Excel | .xlsx, .xlsm | first sheet or `--sheet Name`, date cells, otherwise as CSV |
| Word | .docx | Tables with a header row as CSV, bulleted and numbered lists as tasks, indented items below them as criteria, checkboxes (☐ ☒) as open or done, headings as tags or status |
| Markdown, text | .md, .txt | `- [ ]` and `- [x]`, list items, `TODO:` lines, indented items as criteria, headings as tags. "Text: description" splits title and description |
| works | JSON with a list of candidates | your own list, cleaned up by Claude, see below |
| works backup | JSON from `works export --json` or from the board (format works-board) | separate path with merge or restore, see cli.md and board.md, section on backup and restore |

Columns not mapped to a field end up as a list in the description so nothing is lost. Values are translated: status (Done, Doing, In Bearbeitung, To Do …), priority (Urgent, Hoch, P1 …), effort (story points, hours, days, S to XL), date (ISO, 31.10.2026, 10/31/2026, Excel number, "31. Oktober 2026").

## Steps for Claude

1. Preview: `works import <file>`. For tables the output shows the column mapping. If it is wrong, correct it with `--map title=Task,status=List,description=Note`. Fields: title, description, status, priority, tags, due, effort, type, key, criteria.
2. Check: Do the titles make sense? Are type and priority roughly right? Are there entries that are not tasks (headings, notes)? Duplicates are marked (`already imported`, `similar`, `duplicate in file`) and deselected, and so is anything already done.
3. With more than about ten entries or an uncertain mapping, briefly summarize the preview for the user and ask whether everything should be taken over, or point to the board, where they can pick.
4. Create: `works import <file> --apply [--only 1,4,7 | --skip 3] [--status planned] [--tags import]`. With `--include-done`, done entries are imported as done. (Task files store the status as `geplant`, `in-arbeit`, `erledigt`, `verworfen`; the English inputs `planned`, `in-progress`, `done`, `dropped` work everywhere.)
5. Afterwards: tasks without a description and criteria are marked incomplete. Do not ask about all of them at once, but when each task is started.

Tasks that were in progress or in review in the source system go to Planned; the history records the old status. Every task carries `source: import:<format>:<key>`, so importing the same file a second time creates no duplicates.

## Prose, minutes, emails

If a Word file or text contains prose instead of a list ("Max will take care of the sponsor page by Friday"), the import recognizes little. Then Claude reads the file itself (for .docx with the docx skill, or `works import --format md` for the raw lines), writes the tasks as JSON and imports them:

```json
[
  { "title": "Build sponsor page", "description": "From the minutes of 30 Oct.", "priority": "P2", "due": "2026-11-06",
    "tags": ["website"], "criteria": [{ "text": "Logos of the three sponsors", "done": false }], "type": "feature" }
]
```

```
works import tasks.json            preview
works import tasks.json --apply
```

That way duplicate protection, preview and history stay the same. Leave out invented details (dates, priorities) that are not in the text.
