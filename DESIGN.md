---
name: BPHS-Connect
description: A calm, comfortable ledger for company IT equipment: cool paper-white surfaces, one navy accent, Geist type, rows as the primary object.
colors:
  canvas: "oklch(0.975 0.004 262)"
  surface: "oklch(1 0 0)"
  sunken: "oklch(0.962 0.006 262)"
  sidebar: "oklch(0.958 0.008 262)"
  line: "oklch(0.925 0.006 262)"
  line-strong: "oklch(0.86 0.008 262)"
  ink: "oklch(0.21 0.02 262)"
  ink-2: "oklch(0.37 0.02 262)"
  ink-3: "oklch(0.49 0.018 262)"
  ink-4: "oklch(0.62 0.014 262)"
  accent: "#08384F"
  accent-hover: "#062B3E"
  accent-soft: "#EAF2F5"
  accent-line: "#B8CED9"
  on-accent: "#FFFFFF"
  ok: "oklch(0.43 0.11 155)"
  ok-soft: "oklch(0.955 0.04 155)"
  ok-line: "oklch(0.87 0.07 155)"
  warn: "oklch(0.46 0.1 65)"
  warn-soft: "oklch(0.96 0.05 85)"
  warn-line: "oklch(0.87 0.09 85)"
  bad: "oklch(0.47 0.17 25)"
  bad-soft: "oklch(0.96 0.03 25)"
  bad-line: "oklch(0.86 0.08 25)"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.375rem"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  caption:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  stat:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    fontFeature: "tnum"
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    fontFeature: "tnum"
rounded:
  key: "5px"
  inner: "6px"
  control: "8px"
  panel: "12px"
  pill: "9999px"
spacing:
  unit: "4px"
  control-gap: "8px"
  panel-padding: "20px"
  section-gap: "24px"
  page-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-secondary-hover:
    backgroundColor: "{colors.sunken}"
  button-small:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  badge:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  badge-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  badge-bad:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 10px"
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "56px"
    padding: "8px 16px"
---

# Design System: BPHS-Connect

## Overview

**Creative North Star: "The Ledger Desk"**

A well-kept ledger on a daylit desk: quiet, ruled, trustworthy, and easy to read for hours. The product's whole promise is that the record is correct and nothing is overwritten, so the interface behaves like the record. Rows are the primary object. Chrome recedes, type is large enough to read without squinting, and every state a person needs (who holds this, since when, in what condition, why a button is off) is written down in words rather than implied by color.

It replaces a dense, spreadsheet-style skin (9.5-11px type, 19px controls, a border on every cell, greys at 1.7-2.6:1) with a comfortable, modern one: 14px text, 36px controls, 56px rows, horizontal rules only, and every text pairing measured at 5.5:1 or better. The scene is an office desk in daylight, hours of repetitive entry on a 1440px monitor, which is why the system is light, restrained, and keyboard-first. Dark is deliberately not shipped yet; the tokens are semantic so it is additive.

**Key Characteristics:**
- One cool neutral family (hue 262) and one navy accent. The accent marks primary action, selection and focus, nothing else.
- Status always travels with a word plus a dot or icon. Colour is never the only signal.
- Mono type is reserved for identifiers and measurements: asset tags, serials, employee IDs, timestamps, audit details.
- Permissions are visible: a control the user cannot use stays on screen, disabled, with the rule beside it.
- Restrained motion: sheets slide in, rows you just changed settle from a tint, nothing else animates.

## Colors

A restrained palette: cool paper neutrals, one navy accent, and three status hues that appear only as tinted badges, bars and alerts.

### Primary
- **Navy Action** (#08384F): The primary button, text links, focus rings, the "Assigned" segment of the inventory bar, active nav icon. White text on it measures 12.43:1.
- **Navy Deep** (#062B3E): Primary button hover; white text measures 14.76:1.
- **Navy Mist** (#EAF2F5) and **Navy Edge** (#B8CED9): Tinted fills and borders for accent badges, selected rows, the highlighted combobox option and text selection. Navy on the soft fill measures 10.96:1. The light border tint is decorative; the solid navy focus border/outline supplies the meaningful boundary.

### Neutral
- **Paper** (oklch(0.975 0.004 262)): The page canvas behind everything.
- **Record White** (oklch(1 0 0)): Panels, tables, sheets, inputs. Record surfaces are the only pure white.
- **Sunken** (oklch(0.962 0.006 262)): Table header band, neutral badge fill, filter-tab track, disabled fields.
- **Slate Rail** (oklch(0.958 0.008 262)): The sidebar and mobile bar. One step cooler than the page so navigation reads as a separate layer.
- **Hairline** (oklch(0.925 0.006 262)) and **Hairline Strong** (oklch(0.86 0.008 262)): Row rules and panel borders; input and secondary-button borders.
- **Ink** (oklch(0.21 0.02 262)): Primary text, 17.7:1 on white. **Ink Two** (oklch(0.37 0.02 262)): secondary text, 10.4:1. **Ink Three** (oklch(0.49 0.018 262)): metadata, placeholders, table headers, 6.3:1 on white and 5.5:1 on the sidebar. **Ink Four** (oklch(0.62 0.014 262)): sort-arrow and disabled glyphs only, never text (3.6:1).

### Status
- **Stock Green** (oklch(0.43 0.11 155)) on **Green Tint** (oklch(0.955 0.04 155)): In storage, Good, Create, success toasts.
- **Amber Flag** (oklch(0.46 0.1 65)) on **Amber Tint** (oklch(0.96 0.05 85)): Fair, Update, out-over-a-year days, locked accounts, the forced-password banner.
- **Alert Red** (oklch(0.47 0.17 25)) on **Red Tint** (oklch(0.96 0.03 25)): Poor, Damaged, Delete, errors and the race-conflict banner.

### Named Rules
**The One Accent Rule.** Navy is for the thing you can do next and the thing that is selected. It never decorates, never colours a heading, and never fills a status.
**The Words Beside Colour Rule.** Every status tint is paired with its word and a dot or icon. A greyscale screenshot must still say Assigned, In storage, Retired, Poor.
**The Measured Grey Rule.** Text greys are chosen from measured contrast, not by eye. Nothing carrying meaning goes below 4.5:1; `ink-4` is decoration only.

## Typography

**Display / Body Font:** Geist Variable (system sans fallback). **Data Font:** Geist Mono Variable (system mono fallback). Both are self-hosted through Fontsource, because the app runs on an office network that may have no internet.

**Character:** One workhorse sans carries headings, buttons, labels and body; the mono face appears only where the content is an identifier or a measurement. Tight scale (ratio about 1.2), fixed rem sizes, no fluid type.

### Hierarchy
- **Headline** (600, 1.5rem, 2rem, -0.015em): The page title, once per screen.
- **Title** (600, 1.125rem, 1.75rem, -0.01em): Sheet and dialog titles, sign-in and password cards.
- **Heading** (600, 0.9375rem, 1.375rem): Panel titles ("Out the longest", "Quick add").
- **Body** (400, 0.875rem, 1.25rem): Table cells, descriptions, form text. Prose is capped at 65ch.
- **Label** (500, 0.875rem): Field labels, buttons, nav items, filter tabs.
- **Caption** (500, 0.75rem, 1rem): Table headers, badges, hints, metadata. This is the floor; nothing is smaller.
- **Stat** (600, 1.25rem, tabular): The three inventory counts and the import summary counts. A count, not a hero number.
- **Data** (400, 0.8125rem, tabular): Asset tags, serials, employee IDs, dates and times, audit details.

### Named Rules
**The Mono Means Data Rule.** If it is an identifier, a timestamp or a measured value, it is mono and tabular. If it is a sentence or a label, it is Geist.
**The Twelve Pixel Floor Rule.** No text under 12px. Anything that matters is 14px.

## Layout

A fixed 248px (15.5rem) rail on the left from 1024px up, holding the wordmark, grouped navigation (Work, Records, Administration) and the user menu pinned to the bottom. Below 1024px the rail becomes a 56px top bar with a drawer. Content sits in a column up to 1480px with a 40px gutter (32px at tablet, 16px at phone) and 24-28px between page sections.

Pages follow one rhythm: title and actions, then an optional quick-add or summary panel, then a toolbar (filter tabs left, search right), then the table. The overview breaks the grid into a full-width inventory panel and a 7/5 split of working panels. Tables hide low-priority columns by breakpoint (`sm`, `md`, `lg`, `xl`, `2xl`) rather than scrolling sideways; on a phone an asset row shows tag, type and status in one cell with its action beside it. Where a hidden column is what the row is for, its value moves under the first cell instead of disappearing: an audit entry keeps its user, record and details, a user keeps role and status, an assignment keeps its holder and days out. The column of row actions is pinned to the right edge (`meta.pinned`), so when a value too long to fit (a 40-character tag) makes a table scroll inside its panel, the action is still in view and the text fades under it. Every grid track uses `minmax(0, 1fr)` so a long identifier can never widen the page, and each table scroller is `position: relative` so screen-reader-only text cannot escape it.

Rows are 56px in comfortable density. Controls are 36px (32px inside a row); icon buttons are 32 or 36px square. Spacing runs on a 4px unit; panels pad 20px, sheets 24px.

## Elevation & Depth

Mostly flat with soft, offset shadows, and layering by tone. Panels sit on the paper canvas with a hairline border and a barely-there two-layer shadow; the sidebar is a cooler tone rather than a shadow. Only things that float above the page get real shadows: menus, popovers, toasts and dialogs (`pop`), and the right-hand sheet (`sheet`). The primary button carries a 1px inner highlight and a short navy shadow so it reads as pressable without a gradient.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px oklch(0.2 0.02 262 / 0.05), 0 0 0 1px oklch(0.2 0.02 262 / 0.015)`): Panels, tables, secondary buttons, selected nav item and selected filter tab.
- **Pop** (`box-shadow: 0 10px 28px -6px oklch(0.2 0.03 262 / 0.16), 0 2px 6px oklch(0.2 0.03 262 / 0.08)`): Menus, comboboxes, tooltips, toasts, centred dialogs, the sign-in card.
- **Sheet** (`box-shadow: -16px 0 48px -12px oklch(0.2 0.03 262 / 0.22)`): The Issue, Return, edit and new-account sheets.

### Named Rules
**The Blur Has an Offset Rule.** Every shadow has a y or x offset and a soft blur. No zero-offset glows, no hard block shadows.
**The Floating Means Shadow Rule.** If it does not float above the page, it has no pop shadow.

## Shapes

Gently rounded and consistent: 8px on controls (buttons, inputs, selects, chips, nav items; 6px on items inside menus and the filter-tab thumb), 12px on panels, tables, popovers and centred dialogs (the sheet is a full-height slab with no rounding), full pills for badges and the active-switch track, 5px on keycaps. Borders are 1px hairlines; the focus ring is a 2px navy outline with a 2px offset on every focusable element, with a 3px soft navy halo on text fields. Tables carry horizontal rules only, never vertical cell borders. Icons are Lucide at 1.75 stroke and 16-18px, drawn, never glyphs.

## Components

### Buttons
- **Shape:** 8px radius, 36px high (32px small, 40px large), label weight 500.
- **Primary:** Navy Action fill, white text, a 1px inner highlight. Hover deepens to Navy Deep. One per view or sheet.
- **Secondary:** Record White, Hairline Strong border, panel shadow; hover fills Sunken. The default for row actions (Issue, Return).
- **Ghost / Danger:** Ghost is Ink Two on transparent; danger variants use Alert Red text on a Red Tint hover, or a solid red fill only inside a confirmation dialog.
- **Disabled with a reason:** Never hidden. A rule-based disable (Super Admin only, has history, holds assets) keeps the button focusable, greys it, and shows the reason in a tooltip or beneath a menu item.

### Inputs / Fields
- **Style:** Record White, 1px Hairline Strong border, 8px radius, a faint inset shadow; label above in Label weight, hint or error beneath in Caption.
- **Focus:** Border turns Navy Action with a 3px soft navy halo. **Error:** border and message in Alert Red, announced with `role="alert"`. **Disabled:** Sunken fill, Ink Three text.
- **Combobox:** The same field with a type-ahead list in a portal; opens on click or typing, not on focus; arrows move, Enter or Tab accepts.
- **Chip picker:** The combobox for several items, used to pick people. The field grows to as many rows as it needs; each choice is a 28px chip (Sunken, Hairline, 6px radius) with the name and an X, and the text box shares the last row. Items already chosen leave the list. Enter or Tab adds the highlighted match; the list closes after Enter and stays open after a click, so several can be clicked in a row. Backspace in the empty text box removes the last chip. Left arrow from the start of the text walks back through the chips, where Backspace or Delete removes the one in focus and focus stays in place. The whole field is one tab stop, and each addition and removal is announced. A disabled picker shows its chips with no X.
- **Rating chips:** A radio group of chips. The selected chip shows a check and takes its rating's tint, so selection never relies on colour.

### Badges and status
Pill, 1px tinted border, Caption weight, a leading dot or icon. Tones: neutral, accent, ok, warn, bad. Ratings map New to accent, Good to ok, Fair to warn, Poor and Damaged to bad; user-added ratings stay neutral.

### Data grid (TanStack Table)
Record White panel with a Sunken header band, Caption headers in Ink Three, 56px rows separated by Hairline, hover and selected rows tinted (Paper, Navy Mist). Sortable headers are buttons with an arrow; identifiers are mono and link to their record; two-line cells put the name above and its code and department beneath. The footer shows the count and pager. After you add, issue or return, the affected row settles from a Navy Mist tint over 1.8 seconds.

### Navigation
Left rail on Slate Rail. Items are 36px, Label weight, Ink Two with an Ink Three icon. The active item becomes a Record White pill with a hairline ring and a navy icon. Locked destinations (Users for an Admin) stay in the list with a lock icon and screen-reader text.

**Workspaces.** Under the product name BPHS-Connect sits a switcher with a part for each workspace the account works in (Assets, Grievances, Maintenance, Administrative Reviews): a Hairline-grey track with the chosen part as a Record White pill. Two parts sit side by side; three or more stack in a column, because a third of the sidebar is too narrow for "Maintenance". An account that works in one workspace has no switcher. Each workspace has a sidebar of its own. The chosen part and the active nav icon are navy in every workspace; Grievances and Administrative Reviews are told apart by their own sidebar, the selected workspace in the switcher, and a small "Confidential" line with a lock. The colour comes from the token `--color-workspace`, which aliases the shared navy accent on both sides.

### Sheets and dialogs
Issue, Return and edit forms open as a right-hand sheet (480px, full-width on phones) so the table stays visible behind a 35% ink scrim. The header carries title and one-line consequence, the body scrolls, and the footer is pinned on a Paper band with the primary action last. Focus lands on the first field of the task, not on Close. Centred dialogs are reserved for confirmations, the one-time password, and signing in again when a session ends. The last two must be answered, so Escape and a click outside do not close them.

### Quick-add panel
A Record White panel above the register with labelled fields in one row. Enter adds; pasting spreadsheet rows into the first field adds many and lists any skipped rows by number. Replaces the spec's table-row entry line so labels stay visible and fields are real inputs.

### Rich text
The body of a grievance, an action or a note. One field, the "ruled field", chosen over a floating toolbar because every allowed format stays in view and nothing depends on making a selection first.
- **Frame:** the Inputs shape at full size: Record White, 1px Strong Hairline, 8px radius, and the same navy border and 3px halo when focus is anywhere inside. In error the border turns Alert Red and the message sits beneath with `role="alert"`, as for any field.
- **Bar:** fixed along the top on a Sunken band with a Hairline rule beneath; it sticks to the top of the scroll area in a long body. 32px ghost icon buttons (Lucide, 16px, 1.75 stroke) in groups split by a short Strong Hairline: bold, italic, underline, strikethrough, link; heading, subheading; bulleted list, numbered list, quote; undo and redo at the far right. A format that applies at the cursor shows Accent Soft with an Accent Line ring and `aria-pressed`. Each button has a tooltip naming it and its shortcut. On a narrow screen the bar wraps to a second row; it never scrolls sideways.
- **Link:** the link button swaps the bar for one address input with Add link, Remove link and Cancel. Enter applies, Escape cancels. A bare address gets `https://`, a bare email `mailto:`; anything else is refused in words.
- **Text:** Body size (14px on a 22px line) at a 65ch measure, blocks 10px apart. Heading 18px/600 and subheading 15px/600, each with more room above than below. Lists indent 24px with Ink 3 markers. A quote is Ink 2 behind a 2px Strong Hairline rule: neutral, never a coloured stripe. Links are navy and underlined.
- **Footer:** a Canvas strip with a Hairline rule above: a one-line reminder of what is allowed on the left, the character count against the limit in mono tabular figures on the right. Past the limit the count turns Alert Red and says "over the limit".
- **Reading it back:** the read-only view is the same text rules with no frame, so what was typed looks exactly like what is later read. It only ever shows HTML the server has sanitised.
- **Keyboard:** the bar is a single tab stop; arrow keys, Home and End move along it. Alt+F10 goes from the text to the bar and Escape back. Tab leaves the field, except in a list, where it indents the item.

### Timeline
A grievance's actions and events, or a review's CAPs and updates, read down one rail. Chosen on 2026-10-12 from three mocked directions (rail, ledger, cards; the mock is `qa-shots/slice-3.2/timeline-mock.html`).
- **Rail:** a 1.5px Strong Hairline line down the left with a 24px marker per entry. It stops at the last entry's marker. Month headings (Label size, Ink 3) sit on the text column, and each month is its own ordered list.
- **Types without colour:** every entry carries its type as a word in small capitals beside its number, and each type has its own marker shape: an Action is a filled Ink 2 disc with a tick, an Event an outlined diamond, a Correction a dashed ring with a pencil, an Automatic entry a small Ink 4 dot. The markers are all ink; no type has a colour of its own.
- **Entry:** number in mono, type, chips, and the date and time it happened at the right; then the title at 14px/600, the short description in Ink 2, and "Documented by" in Ink 3. "Details" opens the full text in place, in the Rich text reading style; an entry with no details has no such button. An automatic entry is one Ink 3 line with no card.
- **Corrections:** a correction sits at its own time and carries a dashed "Corrects E06" chip. The corrected entry keeps every word and is marked twice: a Warn Soft tint with a 3px Warn Line edge, and a "Corrected by E61" chip. Either chip goes to the other entry, drawing it first if it was filtered out or not yet reached, and puts focus on it.
- **Back-dated:** an action or event written down more than a day after it happened carries a solid "Recorded 2026-10-12" chip.
- **Controls:** a bar under the panel header: Show (All, Actions, Events) and Order (Newest first, Oldest first) as segmented buttons, and a "Hide automatic" checkbox. Newest first is the default and the choice is remembered in the browser. Filtering by type keeps a correction with the type of what it corrects.
- **Long cases:** 25 entries are drawn at first and the next 25 as the reader nears the end; a "Show 25 more" button does the same without scrolling. All the entries are fetched at once, so the counts, the chips and the filter are exact from the start.
- **Summary:** a panel beside the timeline on wide screens (240px, sticky 24px from the top) with status, owner, grievance date, entry counts by type, and first and latest activity. Below 1024px it sits above the timeline in two columns.
- **Print:** the controls and the summary are dropped, every entry's details are open, and no entry breaks across a page.

### CAPs
A review's Corrective Action Plans. They sit on the review's timeline among its updates rather than in a table of their own, because a CAP is added the way a grievance's action is and its progress is read in the same place. Decided on 2026-10-16 with the Administrative Reviews plan.
- **On the timeline:** a CAP is drawn at the time it was added, numbered `CAP01` where an entry has its number, with a marker of its own: an outlined Ink 2 rounded square with a flag. Its title links to the CAP's page. After its type come its status badge (Not started neutral, In progress warn, Completed ok, Cancelled bad) and an Ink 3 line, "Responsible: name · Due 2026-10-30 · Completed 2026-10-20". These are the CAP as it is now; the automatic entries say what changed and when.
- **Entries about a CAP:** an update, correction or automatic entry filed on a CAP carries a `CAP01` chip, the same quiet chip as "Corrects E06", linking to the CAP's page.
- **Controls:** Show is All, CAPs or Updates. "Hide automatic" never hides a CAP, only the automatic entries.
- **Summary:** "2 of 3 done", which leaves Cancelled CAPs out of both numbers, then each CAP's number as a link beside its status badge.
- **The CAP page** is laid out like a grievance entry's page. Under a "Corrective action plan" eyebrow with the status badge come the title and short description, then Add update, Edit, Change status, Mark complete and Attach files. An account that may not use them sees them disabled with the reason ("Only the reviewer (name) or someone with Edit access…"); on a Completed review the reason is that it must be reopened first. Panels follow: **Facts** (status, Responsible, due date, completed and by whom; then the review it belongs to and who added it), **Details**, **Files** once there are any, and **History**, the review's timeline narrowed to this CAP's entries.
- **Changing status:** Mark complete opens the Change status sheet with Completed chosen and an Evidence file picker. Cancelled needs a reason. A note is shown under the change on the history, with who wrote it.
- **Voided review:** a warn alert says the CAPs are kept as a record, and the buttons are gone.

### Files
Attachments on a grievance or an entry, and on a review, a CAP or an update. Once saved a file is never changed or removed, and the hint under every picker says so.
- **Picking:** a dashed Strong Hairline box labelled "Choose files" wraps the real file input, which is visually hidden but keeps its keyboard focus and label. Choosing again adds to the list rather than replacing it. Each chosen file is a row with its name, its size and a Remove icon button. The hint names the allowed types and the limits (10 MB each, 10 at a time).
- **Attaching later:** on a grievance that is not sealed, a secondary "Attach files" button with a paperclip, which turns into a spinner while the files go up. A refusal arrives as a toast in the server's words.
- **List:** one row per file: a file icon, the filename as a navy download link, and a meta line in Ink 3 with size, who added it, when, and "with E03" when it came with an entry. Files always download; nothing opens in the page.
- **Withdrawn:** the name is struck through in Ink 3 with no link, a warn "Withdrawn" badge, and a line giving the date and the reason. The row stays, so the list still shows everything that was ever added.
- **Withdraw:** a danger-ghost button per file, shown disabled with the reason for an Admin and absent on a Closed or Voided grievance. It opens a sheet with a warn alert ("This cannot be undone") and a required reason, which is also shown on the timeline.

### Case file
A grievance printed whole, saved as a PDF from the browser's print dialog. Decided on 2026-10-13:
- **Printed only from its Print button.** The button logs the print first and opens the dialog only once the log is written; if the log fails, the page says so and nothing prints. Ctrl+P or the browser menu prints a single line asking for the button instead of the case file. Why: a confidential copy should never leave without an audit entry, and the browser cannot be made to wait on a log once its own print has started.
- **The log says "print dialog opened", not "printed".** Browsers do not report whether the dialog was then cancelled, so the entry claims only what is known.
- **The Excel workbook follows the same rule.** Its button logs the export before the file is made, so a failed log means no file.
- **The review report is printed the same way,** from the same print pieces: the review's facts, findings and body, each CAP with its fields and the names of its files, the full history, and a table of every file with its SHA-256. A CAP or an entry is kept on one page where it fits. The Action items export also logs itself before the file is made.

## Do's and Don'ts

### Do:
- **Do** keep text at 14px for anything a person reads or scans, 12px for metadata only, and every meaningful text pair at 4.5:1 or better (the system's own pairs measure 5.5-17.7:1).
- **Do** give every status a word plus a dot or icon, and every disabled rule a visible reason.
- **Do** set identifiers, timestamps and counts in Geist Mono or tabular figures so columns align.
- **Do** keep controls at 36px (32px inside rows) and rows at 56px; make the common path keyboard-complete (Enter adds, Shift+Enter adds another, I issues from a focused row, Ctrl or Cmd+Enter submits a sheet).
- **Do** open focused tasks in the right-hand sheet and save centred dialogs for confirmations.
- **Do** self-host fonts and icons. The app must work on a network with no internet.

### Don't:
- **Don't** return to the spec's spreadsheet skin: no borders on every cell, no 9.5-11px labels, no controls under 32px, no greys under 4.5:1 for text.
- **Don't** build the overview from a grid of same-size KPI cards or hero numbers; lead with what needs a decision.
- **Don't** use the accent for decoration, headings or status fills.
- **Don't** use a coloured side stripe on rows, cards or alerts. The row highlight is a tint, not a bar.
- **Don't** use Unicode glyphs or emoji as icons (keyboard hints included); use the Lucide set.
- **Don't** put a mono face on labels or sentences, or a display face on UI text.
- **Don't** hide a control the user may not use. Disable it and say why.
- **Don't** add motion beyond sheet entry, menu pop-ins and the row settle, and honour `prefers-reduced-motion`.

## Brand artwork and authentication

BPHS-Connect is the app identity in both workspaces; the canonical URL is https://bphs-connect.com. Brightpath Human Services is the corporate identity. The original PNGs and reconstructed SVG masters live in `brand-assets/`; curated exports are self-hosted from `web/public/`. See `BRAND-UPDATE.md` for provenance and per-phase rollback.

Use the 32px compact lighthouse beside live app text in the rail, mobile header, drawer, session dialog, and standalone states. Its image is decorative when text is adjacent. Authentication uses a 260px corporate signature named Brightpath Human Services above the live app name. Preserve intrinsic dimensions and aspect ratios. Browser icons use a separate simplified lighthouse with a cream backing.

Only desktop sign-in (1024px and above) adds the supplied landscape hero in the left column. A left-aligned crop preserves the lighthouse, orange path, and waves in a 512px-high illustration; the form stays 416px wide in the right column. Tablet/phone sign-in retains the centered form and omits the illustration from layout. Password change stays a centered task. Orange is confined to authored artwork; it is not functional text, focus, or a status role. Reading surfaces, neutral grounds, Geist type, component sizes, and all status colors stay stable.

Primary button shadow: `inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(8 56 79 / 0.25)` (`--shadow-primary`). The danger fill remains red with white text (7.47:1 measured). Rendered navy input focus borders on white measure 12.43:1. The `docs/brand-review/` evidence and `design-qa.md` record visual checks and remaining environment gaps.
