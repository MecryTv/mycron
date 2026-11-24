# Priorities, status, effort and risk

## Priorities

The priority describes urgency from the project's point of view, not effort. When in doubt, pick the lower level and ask the user.

| Prio | Name | Criteria | Expected response | Examples |
|---|---|---|---|---|
| P1 | Critical | Production is down or unusable, data loss is imminent, security hole, legal risk, release blocked | Report immediately, interrupt current work if the user agrees. Bug branches with P1 get the prefix `hotfix/` | Bot crashes on startup, token published in the repo, payments fail |
| P2 | High | Important feature missing or broken for many users, blocks other tasks, hard deadline coming up | Schedule next | Verification fails for new accounts, feature for a fixed deadline |
| P3 | Medium | Normal features, improvements, bugs with a workaround | Regular order | New dashboard widget, refactoring a module |
| P4 | Low | Cosmetics, convenience, ideas with unclear value | When there is time or alongside related work | Hover animation, wording change |

Rules:

- A P1 is reported to the user right away, even while working on something else.
- More than three open P1s are a warning sign. Point this out to the user and reassess together.
- Always give a reason when changing a priority: `works set W-0012 priority=P1 --reason "..."`.
- Priorities derived from code markers and GitHub labels are suggestions. Check them when completing the task.

## Status lifecycle

```
backlog ──> planned ──> in-progress ──> review ──> done
   │           │             │             │
   └───────────┴─────────────┴─────────────┴──> dropped

done / dropped ──(reopen with a reason)──> backlog / planned / in-progress
```

The commands accept these English values. The task files store `backlog`, `geplant`, `in-arbeit`, `review`, `erledigt` and `verworfen`; the board and the CLI output show Backlog, Planned, In progress, Review, Done and Dropped.

| Status | Meaning | Set by |
|---|---|---|
| backlog | Captured, not scheduled yet | `works new` |
| planned | Should be tackled next, described well enough | `works set <ID> status=planned` |
| in-progress | Being implemented right now. Ideally only one task at a time | `works start <ID>` |
| review | Implementation finished, waiting for review by the user or tests | `works set <ID> status=review` |
| done | Definition of done met | `works done <ID> --confirm` |
| dropped | Won't be implemented, the reason is documented | `works drop <ID> --reason "..."` |

Blocked is not a status of its own. A task counts as blocked as long as a task in `blocked_by` is not done. `works start` then refuses to start it.

Incomplete (`incomplete: true`) is not a status either, but a marker for quickly captured tasks. Remove it with `works set <ID> incomplete=false` once goal and acceptance criteria are in place.

## Effort

| Value | Guideline |
|---|---|
| S | Under an hour, one file or a clearly bounded spot |
| M | Half a day to a full day, several files |
| L | Several days, several modules |
| XL | Over a week. Should be split into smaller tasks |

For XL, suggest to the user to split the task and chain the parts with `blocked_by`.

## Risk

`low`, `medium` or `high` (stored as `niedrig`, `mittel`, `hoch`). High risk means: hard to undo, poorly tested areas, data migrations, security relevance. With high risk, add a Rollback section even if the type doesn't have one.

## How `works next` prioritizes

Only tasks in `backlog` or `planned` without open blockers can be started. The order comes from:

1. Priority (strongest factor)
2. Overdue or due soon
3. Status planned before backlog
4. Number of tasks this unblocks
5. Small effort before large
6. Penalty for incomplete tasks and high risk

The recommendation is a suggestion. Give the user the reasoning and leave the decision to them.
