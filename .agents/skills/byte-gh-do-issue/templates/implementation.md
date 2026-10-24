# Issue #<N> - <issue title> - Implementation

Status: in progress | Started: <YYYY-MM-DD> | Branch: `<tag>/issue<N>-<slug>` | Issue: <url>

## Decisions

- **Task:** <one sentence, in leading words>
- **Out of scope:** <list>
- **Guardrails:**
  - <must not change / must never do>
- **Definition of Done - scripted:**
  - <command> - <what it proves>
- **Definition of Done - manual:** (user confirms)
  - <item, or "none">
- **Open risks:** <gaps left after grilling, or "none">

## Ownership

| Slice | Owner | Owns (files / section / topic) |
|---|---|---|
| 1.1 | main | <paths> |
| 1.2 | agent-a | <paths> |

Shared files (lockfiles, manifests, CI config, CLAUDE.md/AGENTS.md, this plan) belong to `main`.

## Phase 1 - <name>

- [ ] 1.1 <slice>
- [ ] 1.2 <slice>

## Phase 2 - <name>

- [ ] 2.1 <slice>

## Phase N - Verify + cleanup

- [ ] N.1 Tests, smokes and local CI commands pass, output shown in chat
- [ ] N.2 Every acceptance criterion from the issue checked
- [ ] N.3 User confirms manual DoD items
- [ ] N.4 Issue block removed from CLAUDE.md/AGENTS.md (`check-agentsmd ... clean`)
