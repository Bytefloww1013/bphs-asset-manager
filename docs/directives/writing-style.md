---
description: How code comments, docs and user-facing text are written, and which docs a change must update
scope: root
covers: [comments, docs, writing, prose, copy, ui-copy, american-english, spelling, documentation, readme, module-readme, stale-docs, docs-check, docs-gen, markdown, issue-references]
---

# Writing style

## Comments

- Plain full sentences that say what something is for or why it is so, not what the next line does. Start with the subject (`A maintenance request's date the US way: ...`), not `This function ...`.
- Match the density around you: a doc comment on exported functions and anything non-obvious, little inside bodies.
- Cite the issue when a rule comes from one (`(issue #23)`).

## Docs and copy

- Write American English everywhere: comments, docs, UI copy and identifiers (behavior, honor, color, normalize, center). When you edit a line with British spelling, fix it.
- User-facing text is calm and specific: name the record, say what happened and what to do (`Set a new password before continuing.`).
- A doc that refers to a file that's gone quotes it as `git show <commit>:<path>`, so `docs:check` doesn't flag it.

## Keeping docs current

- Every change updates the docs it makes stale in the same PR: the module's README, `docs/architecture.md` (`bun run docs:gen`), `docs/modules.md`, README, RUNBOOK.
- A module README keeps its required sections: Tables, Resources and rules, Hooks, Public API, Pages, Gotchas.
- `bun run docs:check` must pass. Markdown and generated files are not formatted by hand.
