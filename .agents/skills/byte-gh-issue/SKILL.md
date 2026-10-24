---
name: byte-gh-issue
description: Create a GitHub issue in the current repo with the gh CLI - a typed, verb-first title, a concise Markdown body (Why, Requirements, Changes, General Steps, Definition of Done, References) and fitting existing labels.
argument-hint: "<what the issue is about>"
disable-model-invocation: true
---

# /byte-gh-issue

Request: $ARGUMENTS

## Step 1 - Preflight

Run these from the current directory. Stop and tell the user if any fails; never log in or change gh config for them.
- `gh auth status` - uses the credentials already in gh
- `gh repo view --json nameWithOwner,url` - must be inside a GitHub repo
- `gh label list --limit 200 --json name,description` - the only labels you may use

If the request is too vague to fill Why and Requirements, ask one short question first. Read relevant code or docs in the repo only when it makes the issue more accurate.

## Step 2 - Title

`[TYPE] <Verb> <specific what and where>`

- TYPE, in brackets and all caps, one of: FEATURE, BUG, REFACTOR, RESEARCH, DOCS, CHORE, PERF, SECURITY, TEST, CI, DESIGN, SPIKE
- Starts with an imperative verb (Implement, Fix, Add, Remove, Investigate, Migrate...)
- Descriptive, under ~80 characters, no trailing period
- Example: `[FEATURE] Implement user task system into the admin UI`

## Step 3 - Body

Markdown, in this order. Concise: enough to work from, nothing padded. Skip filler like "This issue is about...".

```markdown
## Why
<1-3 sentences: the problem or value, who it affects>

## Requirements
- <must-have behavior or constraint>

## Changes
- <area / file / component> - <what changes>

## General Steps
- [ ] <step>
- [ ] <step>
- [ ] <step>

## Definition of Done
- <observable outcome that proves the issue is complete>

## References
- [<title>](<url>)
```

- General Steps: 3-6 high-level checkboxes, not a full plan
- Definition of Done: what is true once this is finished (behavior, tests passing, docs updated), not a visual description
- References: real links only (docs, related issues/PRs, repo files via the repo URL, pages on the site). Never invent URLs; if there are none, write `- None yet`

## Step 4 - Labels

Pick the labels from Step 1 that clearly fit (type, area, priority). Never create labels. If none fit, use none.

## Step 5 - Create

Write the body to a temp file outside the repo, then:

```
gh issue create --title "<title>" --body-file <temp file> [--label "<a>" --label "<b>"]
```

Delete the temp file. Reply with the issue URL and the title only.
