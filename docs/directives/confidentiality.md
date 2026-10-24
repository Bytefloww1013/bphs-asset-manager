---
description: Rules for the confidential modules (Grievances, Reviews) and for what may be kept in the browser
scope: root
covers: [confidential, privacy, notifications, grievances, reviews, browser-storage, localStorage, badges, audit]
---

# Confidentiality

## Confidential modules

- Grievances and Reviews have `confidential: true` in their manifests. Write it as a literal: lint rule (e) reads the manifest file.
- A confidential module never notifies: no notification kinds (`modules:gen` refuses them) and no import of `foundation/notifications` (lint rule (e)).
- A confidential module never shows a count: no badge on its workspace, no totals on Home or dashboards outside it.
- A confidential module keeps its own audit log and declares no `auditEntityTypes`.
- A new module handling complaints, performance or HR case data is confidential too. Mark it `confidential: true` without asking the user first; say in your summary that you did.

## The browser

- Nothing from inside a workspace is stored in the browser: no record content, names or ids in `localStorage`, `sessionStorage`, IndexedDB or URLs that are saved for later.
- Browser storage holds UI preferences only (the pages panel's state, timeline order, pins of sidebar page paths), validated against the nav model on read.
