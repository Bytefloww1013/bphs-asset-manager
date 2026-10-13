# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-specified: TypeScript throughout, no Django. Frontend is a Vite + React SPA using TanStack Router, Query and Table with Tailwind v4. Backend is a TypeScript API with SQLite via Drizzle, shipped as a single Docker container. Delegated to the builder: server framework (Hono), password hashing (node:crypto scrypt), session storage (SQLite), icon set (lucide). Mock/seed data is acceptable for development; production runs on live data.

## Users

IT staff and administrators at BPHS who keep the register of company IT hardware (laptops, phones, monitors, keyboards, mice) and of the license and account seats issued to staff. Two roles: **Admin** (day-to-day: add and edit assets, employees, assignments, lists; cannot delete) and **Super Admin** (everything, plus delete, user accounts and password resets). Five accounts today. They work at desks on office-network desktops, in long sessions of repetitive data entry (issuing and returning kit, adding batches of assets, importing HR exports), and need to answer "who has this, how long, in what condition" in seconds.

Employees are a separate directory (87 active, 4 archived in the spec's sample) and do not log in; any Employee can be named as the person who assessed a condition. Programs are the other thing that can hold hardware: a site or service with a Program ID, a name and an address, which holds a physical asset exactly as an employee would.

The same accounts also keep the **Grievance Tracker**: a record of employee grievances, what was done about each and what happened, in a second workspace behind the same sign-in. Only trusted management and IT staff have accounts, and every account can read every grievance. Employees still do not sign in; they are named on grievances, picked from the same directory.

## Product Purpose

An internal system of record for company IT assets: what exists, who holds it, since when, and what condition it was in at each handoff. Success is a complete, tamper-evident history (nothing overwritten, nothing silently deleted) with fast entry and trustworthy answers. Scale in the spec: about 150 assets, 87 employees, 5 users, 4,300 audit entries and growing.

The Grievance Tracker holds the grievances to the same standard: every action and event on a timeline that is only ever added to, every earlier version of a grievance kept, nothing deleted, and a log of its own of who did what. Success is a case that can be handed over, printed or exported whole and still be trusted.

## Positioning

Not a generic ITAM suite. It encodes BPHS's own rules: one active Assignment per asset (enforced in the database), a Condition snapshot at every issue and return, a handoff is a Return then an Issue, assets and people with history are retired or archived and never deleted, and an append-only Audit Log that even Super Admin cannot edit.

## Operating Context

- Office network only (the login screen shows an internal IP). Deployed as one Docker container with a SQLite file on a mounted volume. Possibly no internet access, so no CDN-hosted fonts, scripts or icons.
- Heavy keyboard use: a live entry row on editable grids, Tab to move, Enter to commit, shortcuts for Issue and Return, paste a block from Excel to add many assets.
- HR provides employee lists, and programs arrive the same way, as `.csv` (UTF-8 BOM from Excel) or `.xlsx`. The Import/Export screen matches the file's columns to the fields by header (Employee ID, First name, Last name required; Department, Job title optional; Program ID, Program name required; Program address optional) and lets the user correct the match. Re-running a file is safe: duplicates are skipped, bad rows reported by row number and offered back as a CSV to fix.
- Account policy: five wrong attempts lock an account for 15 minutes; new and reset accounts must change the password on first login; only a Super Admin can reset a password or clear a lock.

## Capabilities and Constraints

Twelve screens from the design spec: Log in; Forced password change; Dashboard; Active Assignments; Available Assets; Issue an Asset; Return an Asset (with race-conflict state); Employees; Asset detail with Assignment and Condition history; Lists (Asset Types, Digital Asset Types, Condition Ratings); Audit Log; Users. The spec's thirteenth, Import Employees from CSV, became part of Import/Export. Added since: Programs; Digital Assets; Import/Export (under Administration).

The app has two **workspaces**, Assets (everything above) and Grievances, chosen with a switcher at the top of the sidebar; each has a sidebar of its own and nothing from one appears in the other. Sign-in, the account menu and Users are shared. Grievances screens: Grievances (list with status tabs, filters and search); New grievance; Grievance detail (facts, body, files, timeline and its summary); Edit grievance; Earlier versions; Add action or event (also adds a correction); Entry detail; Case file (print layout, saved as a PDF); Categories; Grievance Audit Log.

Terminology to preserve: Physical Asset (what the screens call the hardware register; "Asset" in older notes means the same thing), Digital Asset (one license or account seat, with an Asset ID such as `DA-00001`, a Digital Asset Type and a License/Account; Active, Not Issued or Inactive), Program (Program ID, Program name, Program address), Import/Export, Asset tag (`BPHS-0141`), Assignment, Condition (rating + notes snapshot), Issue, Return, Retire, Archive, Employee, User, Audit Log, Super Admin, Admin, In Service, In storage, Days out.

Rules the UI must express: delete is Super Admin only and only for records with no history; Admin sees delete controls disabled with the reason; Users screen returns 403 for Admin; Audit Log is read-only for everyone; each of the two lists keeps at least one active entry, so the last active Asset Type or Condition Rating can be neither deactivated nor deleted; Condition Ratings each carry a unique `score` from 1 to 100 (100 is as good as new) that sets the order of the rating scale in Issue and Return, the badge colour, the default rating and the overview's condition watch (below 50); the score is shown only on the Lists screen. A physical asset has one holder, an employee or a program, never both; a program that has held an asset is deactivated, not deleted. A digital asset is issued to employees only, its Asset ID is given by the system and never edited, and its License/Account names a seat and never holds a password, key or token. Overview, Active Assignments and Available cover physical assets only. An import creates employees and programs and nothing else: it never updates a record, never issues anything, and shows every row as New, Duplicate or Error before anything is written; its result reads "N imported, N duplicates skipped, N failed". Exports show who holds what, as CSV or Excel, with Excel cells written as text and never as formulas.

Grievance terminology: Grievance (Grievance ID `GR-2026-0001`, given by the system and never typed, edited or reused; Title, Short Description, Body Text, Date Made, Category, Owner, Employees Involved, Management Involved), Entry (Entry ID `GR-2026-0001-E01`; an Action, an Event, a Correction, or an Automatic entry the system writes for a status change, a new owner, an edit or a file), Occurred at and Recorded at, Documented By, Status (Open, In progress, Resolved, Closed, Voided), Void, Files (Attach, Withdraw), Case file, Excel workbook, Grievance Categories, Grievance Audit Log, Workspace.

Grievance rules the UI must express: either role can create a grievance and add actions, events, corrections and files to any grievance; only the owner's account (the account linked to the employee named as Owner) or a Super Admin can edit a grievance, change its status or give it a new owner, and everyone else sees those controls disabled with that reason; an owner with no account means only a Super Admin can change it. Voiding a grievance and withdrawing a file are Super Admin only and need a reason. An entry is never edited or deleted: a mistake is fixed by a Correction linked to it, and the original stays in full. Editing a grievance needs a reason and keeps every earlier version. A Closed or Voided grievance takes nothing new until reopened (a Voided one never). Occurred at may be back-dated but not in the future; Recorded at is set by the server. A person cannot be in both Employees Involved and Management Involved. Documented By is the signed-in account, never chosen. An employee named on a grievance cannot be deleted, and one who owns a grievance that is not Closed or Voided cannot be archived. Files are PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, up to 10 MB each, always downloaded as a file and never shown in the page; a withdrawn file stops downloading but its name, who added it and why it was withdrawn stay. The Grievance Audit Log records every change, every download and every export, with IDs, titles and filenames only, never body text; the Audit Log on the Assets side records none of it, and viewing a grievance is not logged. The case file prints only from its Print button, after the print is logged.

Undecided: what "BPHS" expands to; whether bulk Return needs per-asset condition; whether the Audit Log should also record sign-outs (it records sign-ins and, of the failed attempts, only the one that locks an account); importing physical or digital assets (deliberately left out; exports of both exist); whether import should be Super Admin only (both roles can today); email or notification features (none assumed). For grievances: limiting a grievance to named people or a separate HR role (every account reads every grievance today); legal retention or disposal schedules; moving attachments out of the database if backups grow too large; due dates, reminders or escalation (none built).

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
