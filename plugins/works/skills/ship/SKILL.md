---
name: ship
description: Use when a task from .works is finished on its feature branch and should be wrapped up with merge and push, for example with "ship", "finish and push", "merge and upload" or "wrap up as usual".
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`), read [SKILL.de.md](SKILL.de.md) instead and answer the user in German. For any other language, use these English docs and answer in that language.

# ship

Finishes a works task in one go. The CLI:

```
node "${CLAUDE_SKILL_DIR}/../works/scripts/works.mjs" ship [<ID>] [--no-push] [--no-ci] [--no-update] [--no-open]
```

Claude Code replaces `${CLAUDE_SKILL_DIR}` with this skill's folder. Without an ID, ship takes the active task.

## Before the call

1. Code, tests and docs of the task are committed on the feature branch.
2. Tests and checks have run, code-audit is recorded, acceptance criteria and implementation plan are checked off, history and handoff are up to date. For UI work, an after screenshot is attached to the task.
3. ship merges and pushes. That only counts as requested if the user asked for a merge or push ("ship", "finish and push", "wrap up as usual"). If they only say the task is done, ask first.

## What ship does

In order, with one `ok` line per step:

1. Check the definition of done (`works done` without `--confirm`).
2. Refuse uncommitted changes and new untracked files outside `.works`.
3. Stop a running board.
4. Reset `WORKS.md` and `time.jsonl`, keep the new time entries aside, commit the remaining `.works` changes on the branch.
5. Fast-forward the main branch, merge the feature branch with `--no-ff`.
6. `works done --confirm`, commit `.works` (the kept time entries go along).
7. Push, delete the feature branch locally and on the remote.
8. On GitHub, wait for CI of the pushed commit (ci-watch plugin).
9. If the repo is a marketplace (`.claude-plugin/marketplace.json`): update the marketplace and all plugins installed from it.
10. If the board was running, restart it with the newest version on the same port. `--open` only opens a tab if no works tab is open.

## When ship stops

ship exits with code 1 and says what is wrong. Before step 5, nothing in the repo has changed except the commit from step 4. ship restarts a stopped board on every abort.

| Message | What to do |
|---|---|
| Definition of done not met | Take care of the items it names and run ship again. Don't get around it with `works done --force` unless the user explicitly wants that. |
| Uncommitted changes | If they belong to the task, commit them (new files too, marked with `??`). Otherwise ask the user; don't discard or delete them. |
| Merge has conflicts | On the feature branch run `git merge <main branch>`, explain the conflicts to the user and wait for their decision. Then run ship again. |
| Main branch can't be fast-forwarded | The remote has commits that are missing locally. Tell the user, don't force-push. |
| works done --confirm failed | The merge is local and not pushed. Fix the error, then `works done <ID> --confirm`, commit `.works` and push. |
| Push failed | Everything is committed locally. Name the cause (permissions, network, remote ahead), never force-push. |
| CI red | The push has already happened, don't revert it. Read the error from the message and tell the user. The CI watcher creates a bug for it on its own or adds to the open one (the message names the ID). Ask whether you should fix it right away on a new branch; don't start on your own. Plugins are not updated in that case; the next ship catches up. |

## Afterwards

Report briefly to the user: merged branch, commit, CI result, updated plugins and the board URL.
