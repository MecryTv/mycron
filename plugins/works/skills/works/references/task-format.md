# Task format

## Folder of a task

```
.works/tasks/W-0012-rework-login-page/
  task.md        frontmatter and content of the task
  decisions.md   design decisions (automatic for type design, otherwise via works decisions)
  assets/        images and files, maintained via works asset
  docs/          copied or moved documents, such as brainstorm results
```

The folder name is built from ID and title when the task is created. Changing the title later doesn't rename the folder; the ID stays the reference.

## Frontmatter

Written only through the CLI (`works new`, `works set`, `works link` and others).

| Field | Values | Meaning |
|---|---|---|
| id | `W-0012` | Unique ID, prefix in config.json |
| title | Text | Short and concrete, describes the result |
| type | feature, bug, refactor, spike, chore, design, debt | Determines template and DoD checks |
| priority | P1 to P4 | See priorities.md |
| status | backlog, planned, in-progress, review, done, dropped | See priorities.md. The file stores `geplant`, `in-arbeit`, `erledigt` and `verworfen` for the planned, in-progress, done and dropped states |
| effort | S, M, L, XL | Effort estimate |
| risk | low, medium, high | Risk assessment. Stored as `niedrig`, `mittel`, `hoch` |
| created | Date | Creation date |
| updated | Date | Last change through the CLI |
| due | Date | Optional deadline |
| completed | Date | Date the task was done or dropped |
| milestone | `M1` | Milestone from config.json |
| branch | Text | Suggested or used Git branch |
| tags | List | Free keywords. `ui` turns on additional DoD checks, `intern` hides the task in the changelog |
| blocked_by | List of IDs | Must be done first |
| blocks | List of IDs | Waits for this task (kept in sync on both sides) |
| related | List of IDs | Related in content |
| source | Text | Origin: `manuell`, `todo:file#hash`, `github#12`, `idee:I-003`, `stacktrace` |
| incomplete | true, false | Captured quickly, details still missing |
| reopened | Number | How often the task was reopened |
| issue | Text | Linked GitHub issue after `works gh-export` |

## Sections per type

All types end with: Assets, Open questions, Handoff, History.

| Type | Sections before that |
|---|---|
| feature | Goal, Context and problem, User perspective, Acceptance criteria, Implementation plan, Affected files, Design decisions |
| bug | Summary, Reproduction, Expected behavior, Actual behavior, Environment, Logs and error messages, Root cause, Solution, Acceptance criteria, Affected files |
| refactor | Goal, Current state, Target architecture, Motivation, Risks, Rollback, Implementation plan, Acceptance criteria, Affected files, Design decisions |
| spike | Research question, Timebox, Hypotheses, Approach, Results, Recommendation, Follow-up tasks, Acceptance criteria |
| chore | Description, Checklist, Acceptance criteria, Affected files |
| design | Goal, Audience and context, References, Variants, Chosen solution, Acceptance criteria, Implementation plan, Affected files, Design decisions |
| debt | Shortcut taken, Reason, Follow-up costs and risk, Trigger, Repayment, Acceptance criteria, Affected files |

New tasks get their headings in the configured language. The CLI reads both the English and the German headings (Goal or Ziel, Acceptance criteria or Akzeptanzkriterien and so on), so older German tasks stay valid.

The templates are in `templates/`. Replace placeholder comments (`<!-- ... -->`) with content when filling them in. Empty sections may stay; don't rename section headings, because the CLI reads them for its checks. Additional sections are allowed (for example `## Origin` for imported tasks or `## Commits` after `works commits --write`).

## Description section

The central place of every task: what should happen, why, background, details, links and notes from the user. The board's "New task" dialog has only this one text field for it, the CLI has `works new --description "..."`. The section sits directly below the template's main section (Goal, Summary and so on); for chores it is the main section itself. The detail panel shows it as the first section, and a goal only if it is filled in. Claude reads the description first before working and treats it as binding.

## Writing rules for content

- Goal: one to three sentences describing the result, not the activity. Good: "New accounts reliably get the Member role after verification." Bad: "Fix verification."
- Acceptance criteria: one checkable statement per line as a checkbox. Measurable where possible ("Page loads in under 1.5 s on 4G").
- Implementation plan: small steps as checkboxes. Subtasks belong here. Only create a separate task and link it if a part gets its own priority or is done by someone else.
- Affected files: paths with a short note, for example `src/commands/verify.ts: role assignment after captcha`.
- Open questions: `- [ ] Question` via `works question`. Once settled, check it off with `works question <ID> --resolve <no> --answer "..."`; the answer goes into the matching section.
- Handoff: see workflow.md. It is overwritten, not appended to.
- History: only through the CLI (`works log`). Format `- YYYY-MM-DD: text`. Records decisions, status changes and important milestones, not a diary of every small step.

## decisions.md

Structure:

- Sources: links to brainstorm documents, UI UX Pro Max output, references
- Brainstorm summary: understanding of the problem, approaches considered, result in your own words
- Decisions: numbered blocks E1, E2 with date, source, context, decision, reasoning, rejected alternatives with their reasons, and consequences
- UI and UX: style, color palette as a table, typography, layout and spacing, components, accessibility, rejected variants

Rejected alternatives are mandatory as soon as there were any. The why is the first thing to get lost otherwise.

New decision via the CLI:

```
works decisions W-0012 --add "Card layout instead of table" \
  --decision "Tasks as cards in a grid" --why "Easier to read on mobile" \
  --rejected "Table: horizontal scrolling on mobile,List: too little room for preview images" \
  --source "UI UX Pro Max"
```

`--rejected` separates alternatives with commas.
