# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-specified: TypeScript throughout, no Django. Frontend is a Vite + React SPA using TanStack Router, Query and Table with Tailwind v4. Backend is a TypeScript API with SQLite via Drizzle, shipped as a single Docker container. Delegated to the builder: server framework (Hono), password hashing (node:crypto scrypt), session storage (SQLite), icon set (lucide). Mock/seed data is acceptable for development; production runs on live data.

## Users

IT staff and administrators at BPHS who keep the register of company IT hardware (laptops, phones, monitors, keyboards, mice). Two roles: **Admin** (day-to-day: add and edit assets, employees, assignments, lists; cannot delete) and **Super Admin** (everything, plus delete, user accounts and password resets). Five accounts today. They work at desks on office-network desktops, in long sessions of repetitive data entry (issuing and returning kit, adding batches of assets, importing HR exports), and need to answer "who has this, how long, in what condition" in seconds.

Employees are a separate directory (87 active, 4 archived in the spec's sample) and do not log in; any Employee can be named as the person who assessed a condition.

## Product Purpose

An internal system of record for company IT assets: what exists, who holds it, since when, and what condition it was in at each handoff. Success is a complete, tamper-evident history (nothing overwritten, nothing silently deleted) with fast entry and trustworthy answers. Scale in the spec: about 150 assets, 87 employees, 5 users, 4,300 audit entries and growing.

## Positioning

Not a generic ITAM suite. It encodes BPHS's own rules: one active Assignment per asset (enforced in the database), a Condition snapshot at every issue and return, a handoff is a Return then an Issue, assets and people with history are retired or archived and never deleted, and an append-only Audit Log that even Super Admin cannot edit.

## Operating Context

- Office network only (the login screen shows an internal IP). Deployed as one Docker container with a SQLite file on a mounted volume. Possibly no internet access, so no CDN-hosted fonts, scripts or icons.
- Heavy keyboard use: a live entry row on editable grids, Tab to move, Enter to commit, shortcuts for Issue and Return, paste a block from Excel to add many assets.
- HR provides employee CSV exports (UTF-8 BOM from Excel, required `employee_id`, `first_name`, `last_name`; optional `department`, `job_title`). Re-running a file is safe: duplicates are skipped, bad rows reported by row number.
- Account policy: five wrong attempts lock an account for 15 minutes; new and reset accounts must change the password on first login; only a Super Admin can reset a password or clear a lock.

## Capabilities and Constraints

Thirteen screens from the design spec: Log in; Forced password change; Dashboard; Active Assignments; Available Assets; Issue an Asset; Return an Asset (with race-conflict state); Employees; Import Employees from CSV; Asset detail with Assignment and Condition history; Lists (Asset Types, Condition Ratings); Audit Log; Users.

Terminology to preserve: Asset, Asset tag (`BPHS-0141`), Assignment, Condition (rating + notes snapshot), Issue, Return, Retire, Archive, Employee, User, Audit Log, Super Admin, Admin, In Service, In storage, Days out.

Rules the UI must express: delete is Super Admin only and only for records with no history; Admin sees delete controls disabled with the reason; Users screen returns 403 for Admin; Audit Log is read-only for everyone; each of the two lists keeps at least one active entry, so the last active Asset Type or Condition Rating can be neither deactivated nor deleted; Condition Ratings each carry a unique `score` from 1 to 100 (100 is as good as new) that sets the order of the rating scale in Issue and Return, the badge colour, the default rating and the overview's condition watch (below 50); the score is shown only on the Lists screen.

Undecided: what "BPHS" expands to; whether bulk Return needs per-asset condition; reporting/export beyond CSV of Active Assignments and Audit Log; email or notification features (none assumed).

## Brand Commitments

Product name "BPHS Asset Management" (short: "BPHS Assets"). No logo, brand colors or typeface supplied. The spec's identity (dark app bar, blue accent, IBM Plex) is the design under review, not a binding commitment.

## Evidence on Hand

The "Dashboard design specifications" artifact: 13 screens at 1440x880 with synthetic sample data (assets, employees, audit entries, users). All sample people and tags are fabricated and must be replaced by live data. No real asset or employee data, logo or screenshots of the production environment exist yet.

## Product Principles

1. The record is the product: history is never overwritten or silently deleted, and the interface says so wherever a destructive action is disabled.
2. Entry speed beats ceremony: the common actions (add, issue, return) stay inline or one step away and are fully keyboard-operable.
3. Answer the question before the chart: lead with what needs attention (long-overdue returns, poor condition, unassigned stock), not decorative totals.
4. Permissions are visible, not hidden: a control the user cannot use is shown disabled with the rule behind it.
5. Calm and trustworthy over clever: a tool that disappears into the task for people who use it all day.

## Accessibility & Inclusion

Target WCAG 2.2 AA (inferred, not stated by the user): 4.5:1 text contrast, visible keyboard focus, controls at least 32px (24px minimum target), status never conveyed by color alone, respects `prefers-reduced-motion`. The spec's 9.5-11px text and `#9aa1a8`/`#c2c7cc` greys on white (about 2.6:1 and 1.7:1) fall below this.
