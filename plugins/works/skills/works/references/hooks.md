# Hooks

A skill is only loaded when Claude considers it relevant. Hooks make sure the tasks are visible at session start and the handoff isn't forgotten. All hooks stay silent in projects without `.works/`.

## Installation via the mycron plugin

When works is installed as a plugin from the mycron marketplace, it brings the SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, SubagentStop and Stop hooks with it (`plugins/works/hooks/hooks.json`). They are active as long as the plugin is enabled and are updated automatically with every plugin update. `works install-hooks --claude` is then not needed and says so.

The only thing to set up per project is the Git pre-commit hook:

```
works install-hooks --git
```

## Installation as a plain skill folder

If the skill lives directly under `~/.claude/skills/works`, `works install-hooks` sets up the Claude Code hooks. This changes the user's configuration files. Ask first and show what will happen with `--dry-run`.

```
works install-hooks --dry-run
works install-hooks                     # Claude Code hooks globally plus Git pre-commit in the current repo
works install-hooks --claude --scope project
works install-hooks --git
```

| Option | Target |
|---|---|
| `--scope user` (default) | `~/.claude/settings.json`, applies to all projects |
| `--scope project` | `.claude/settings.json` in the project, shared with the repo |
| `--scope local` | `.claude/settings.local.json`, local only |

If the skill lives under the home directory, the path is written as `$HOME/...`. Running it more than once doesn't create duplicates.

If the plugin is installed and the skill also exists as a folder, set up the hooks only once, otherwise they run twice.

## SessionStart

File: `hooks/session-start.mjs`, matcher `startup|resume|clear|compact`.

Regenerates WORKS.md and an existing board.html, replaces board servers of this project that still run an older works version, and puts a short overview into the context: number of open tasks, open P1 and P2, overdue items, the active task with its handoff (cut to 1500 characters) and open questions, plus a notice about files in the inbox. Added to that are the active sprint, the queue, new comments from the user and a notice if a weekly report is due according to the settings. Especially after `compact` this restores the working state.

Also: the project is registered in `~/.works/projects.json` for `works hub`, due recurring tasks are created (history `[Wiederkehrend]`), and if the GitHub sync is due, it starts in the background. The overview names the areas of project knowledge, proposals waiting for the user, and tasks with design variants that have no choice yet.

The hook also tells Claude the configured language (`works lang`, see config.md), for example `Language: de, answer in German, German docs in SKILL.de.md and references/de/`. Claude then answers in that language and, for German, reads the German version of the docs.

Turn off per project: `"hooks": { "session_start": false }` in `.works/config.json`.

## Stop

File: `hooks/stop-reminder.mjs`.

Runs when Claude finishes a reply, in this order:

1. Attribute the time and token usage of the reply to the active task. The hook reads the transcript from the last position it read (`.works/.usage-state.json`), counts each message only once and writes `usage` lines to `time.jsonl`.
2. If instructions from the board are waiting that Claude hasn't received yet, the hook continues the reply with these instructions. This happens only once per reply (`stop_hook_active`).
3. Set the "Claude is working" display in the board to paused.
4. If a task is active and, according to `git status`, project files changed since the last change to its task.md, the hook asks once to update history, checkmarks and handoff. Without a Git repository this is skipped.

How to respond: briefly run `works log` and `works handoff`, tick the checkmarks. If nothing relevant happened, just carry on.

Turn off the reminder per project: `"hooks": { "stop_reminder": false }`. Time and usage: `"time_tracking": false`.

## UserPromptSubmit

File: `hooks/prompt-submit.mjs`.

Records when a request starts, for time tracking, and shows "Claude is working" in the board. If there are instructions for the active task, they come along as context. Only when a task is active via `works start`.

## PreToolUse

File: `hooks/pre-tool.mjs`, no matcher, timeout 5 seconds.

Reports every tool call before it runs: `current` in `.works/activity.json` gets the call with `running: true`, the list of recent calls stays unchanged. That way, during a long command like `npm test`, the live view shows the command itself and its runtime instead of the call before it. Otherwise the hook writes nothing and prints nothing. It costs about 0.2 seconds per tool call (Node startup, measured on Windows). Turn off with `"live_activity": false`.

## PermissionRequest

File: `hooks/permission.mjs`, no matcher, timeout 5 seconds.

Runs when Claude Code is about to ask the user to approve a tool call. Marks the running call in `.works/activity.json` with `perm: true` and `permSince`, so the live view shows "Claude is waiting for your approval" with command and waiting time. The hook prints nothing and never decides on the approval, that stays with the user.

The state ends with the next PreToolUse or PostToolUse of the same agent, with Stop or UserPromptSubmit. Calls of another agent (different `agent_id` in the hook input) go into the history but don't replace the pending approval. A denial and the moment of approval itself don't trigger a hook: after an approval the display therefore stays on "waiting" until that call ends, after a denial until the next message. After 60 minutes at the latest it counts as outdated. Turn off with `"live_activity": false`.

## PostToolUse

File: `hooks/post-tool.mjs`, no matcher, timeout 5 seconds.

After every tool call, writes a short line to `.works/activity.json` (for example "Edited src/backup.ts" or "Command npm test"), which the board shows on the active card and in the live view, and records in `.works/steps.json` when steps of the task's implementation plan were ticked. File contents and command output are not stored, only the tool, the file name or the first characters of the command. If there is a new instruction from the user, it reaches Claude here as context, so it arrives while Claude is still answering. Claude should take it into account as soon as it makes sense.

If the tool response contains a `backgroundTaskId` (a command with `run_in_background`, or one that moved to the background after its timeout), the command keeps running after the call. The hook then also enters it under `background` in `.works/activity.json`: ID, task, tool, description (`description`, otherwise the first characters of the command), start (for a moved command earlier by `timedOutAfterMs`) and the path of the output file, which it looks up under `<tmp>/claude/*/<session_id>/tasks/<id>.output`. If it finds no file, the path is left out. At most ten entries, newest first; finished ones that ended more than an hour ago drop out. Running or finished with which exit code, the board reads from the end of that file (board.md, Live view).

The hook also records, for Edit, Write and NotebookEdit, which file was changed for which task (`.works/files.jsonl`, local). When a file is changed for the first time in a session and other tasks made decisions there or are currently running, Claude gets a one-time notice with those tasks and their decisions.

With parallel work, the hook recognizes from the path which worktree a call belongs to. Activity, files and instructions then go to that task, not to the active task of the main session.

Turn off: `"live_activity": false` in `.works/config.json` (instructions then only arrive via the Stop hook), `"file_tracking": false` for files and notices.

## SubagentStop

File: `hooks/subagent-stop.mjs`.

Attributes an agent's token usage, from its own transcript (`agent_transcript_path`), to the matching task: the task of its worktree for parallel work, otherwise the active task. Older Claude Code versions without a separate agent transcript count the usage in the Stop hook.

## Git pre-commit

Appended to `.git/hooks/pre-commit` (existing content is kept). If files from `.works/` are committed, `works doctor --quiet` runs. On errors (not on warnings) the commit is aborted. With the plugin installation, the hook looks up the current path of the CLI at runtime, because the installation folder changes with updates. If the CLI isn't found, the check is skipped instead of blocking the commit. In an emergency, bypass it with `git commit --no-verify`.

## Manual entry

Only for the installation as a skill folder:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume|clear|compact",
        "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/session-start.mjs\"", "timeout": 15 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/prompt-submit.mjs\"", "timeout": 10 }] }
    ],
    "PreToolUse": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/pre-tool.mjs\"", "timeout": 5 }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/permission.mjs\"", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/post-tool.mjs\"", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/subagent-stop.mjs\"", "timeout": 10 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/stop-reminder.mjs\"", "timeout": 15 }] }
    ]
  }
}
```

## Removing

Plugin: disable or uninstall it via `/plugin`. Skill folder: delete the works entries from the respective settings.json. In both cases remove the block starting at `# works-doctor` from `.git/hooks/pre-commit`.
