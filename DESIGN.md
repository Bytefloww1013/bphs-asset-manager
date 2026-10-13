---
name: BPHS Asset Management
description: A calm, comfortable ledger for company IT equipment: cool paper-white surfaces, one cobalt accent, Geist type, rows as the primary object.
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
  accent: "oklch(0.5 0.19 262)"
  accent-hover: "oklch(0.44 0.19 262)"
  accent-soft: "oklch(0.96 0.025 262)"
  accent-line: "oklch(0.88 0.06 262)"
  on-accent: "oklch(0.99 0 0)"
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

# Design System: BPHS Asset Management

## Overview

**Creative North Star: "The Ledger Desk"**

A well-kept ledger on a daylit desk: quiet, ruled, trustworthy, and easy to read for hours. The product's whole promise is that the record is correct and nothing is overwritten, so the interface behaves like the record. Rows are the primary object. Chrome recedes, type is large enough to read without squinting, and every state a person needs (who holds this, since when, in what condition, why a button is off) is written down in words rather than implied by color.

It replaces a dense, spreadsheet-style skin (9.5-11px type, 19px controls, a border on every cell, greys at 1.7-2.6:1) with a comfortable, modern one: 14px text, 36px controls, 56px rows, horizontal rules only, and every text pairing measured at 5.5:1 or better. The scene is an office desk in daylight, hours of repetitive entry on a 1440px monitor, which is why the system is light, restrained, and keyboard-first. Dark is deliberately not shipped yet; the tokens are semantic so it is additive.

**Key Characteristics:**
- One cool neutral family (hue 262) and one cobalt accent. The accent marks primary action, selection and focus, nothing else.
- Status always travels with a word plus a dot or icon. Colour is never the only signal.
- Mono type is reserved for identifiers and measurements: asset tags, serials, employee IDs, timestamps, audit details.
- Permissions are visible: a control the user cannot use stays on screen, disabled, with the rule beside it.
- Restrained motion: sheets slide in, rows you just changed settle from a tint, nothing else animates.

## Colors

A restrained palette: cool paper neutrals, one cobalt accent, and three status hues that appear only as tinted badges, bars and alerts.

### Primary
- **Cobalt Action** (oklch(0.5 0.19 262), about #1e59cd): The primary button, text links, focus rings, the "Assigned" segment of the inventory bar, active nav icon. White text on it measures 6.1:1.
- **Cobalt Deep** (oklch(0.44 0.19 262)): Primary button hover.
- **Cobalt Mist** (oklch(0.96 0.025 262)) and **Cobalt Edge** (oklch(0.88 0.06 262)): Tinted fills and borders for accent badges, selected rows, the highlighted combobox option and text selection.

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
**The One Accent Rule.** Cobalt is for the thing you can do next and the thing that is selected. It never decorates, never colours a heading, and never fills a status.
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

Mostly flat with soft, offset shadows, and layering by tone. Panels sit on the paper canvas with a hairline border and a barely-there two-layer shadow; the sidebar is a cooler tone rather than a shadow. Only things that float above the page get real shadows: menus, popovers, toasts and dialogs (`pop`), and the right-hand sheet (`sheet`). The primary button carries a 1px inner highlight and a short cobalt shadow so it reads as pressable without a gradient.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px oklch(0.2 0.02 262 / 0.05), 0 0 0 1px oklch(0.2 0.02 262 / 0.015)`): Panels, tables, secondary buttons, selected nav item and selected filter tab.
- **Pop** (`box-shadow: 0 10px 28px -6px oklch(0.2 0.03 262 / 0.16), 0 2px 6px oklch(0.2 0.03 262 / 0.08)`): Menus, comboboxes, tooltips, toasts, centred dialogs, the sign-in card.
- **Sheet** (`box-shadow: -16px 0 48px -12px oklch(0.2 0.03 262 / 0.22)`): The Issue, Return, edit and new-account sheets.

### Named Rules
**The Blur Has an Offset Rule.** Every shadow has a y or x offset and a soft blur. No zero-offset glows, no hard block shadows.
**The Floating Means Shadow Rule.** If it does not float above the page, it has no pop shadow.

## Shapes

Gently rounded and consistent: 8px on controls (buttons, inputs, selects, chips, nav items; 6px on items inside menus and the filter-tab thumb), 12px on panels, tables, popovers and centred dialogs (the sheet is a full-height slab with no rounding), full pills for badges and the active-switch track, 5px on keycaps. Borders are 1px hairlines; the focus ring is a 2px cobalt outline with a 2px offset on every focusable element, with a 3px soft cobalt halo on text fields. Tables carry horizontal rules only, never vertical cell borders. Icons are Lucide at 1.75 stroke and 16-18px, drawn, never glyphs.

## Components

### Buttons
- **Shape:** 8px radius, 36px high (32px small, 40px large), label weight 500.
- **Primary:** Cobalt Action fill, white text, a 1px inner highlight. Hover deepens to Cobalt Deep. One per view or sheet.
- **Secondary:** Record White, Hairline Strong border, panel shadow; hover fills Sunken. The default for row actions (Issue, Return).
- **Ghost / Danger:** Ghost is Ink Two on transparent; danger variants use Alert Red text on a Red Tint hover, or a solid red fill only inside a confirmation dialog.
- **Disabled with a reason:** Never hidden. A rule-based disable (Super Admin only, has history, holds assets) keeps the button focusable, greys it, and shows the reason in a tooltip or beneath a menu item.

### Inputs / Fields
- **Style:** Record White, 1px Hairline Strong border, 8px radius, a faint inset shadow; label above in Label weight, hint or error beneath in Caption.
- **Focus:** Border turns Cobalt Action with a 3px soft cobalt halo. **Error:** border and message in Alert Red, announced with `role="alert"`. **Disabled:** Sunken fill, Ink Three text.
- **Combobox:** The same field with a type-ahead list in a portal; opens on click or typing, not on focus; arrows move, Enter or Tab accepts.
- **Rating chips:** A radio group of chips. The selected chip shows a check and takes its rating's tint, so selection never relies on colour.

### Badges and status
Pill, 1px tinted border, Caption weight, a leading dot or icon. Tones: neutral, accent, ok, warn, bad. Ratings map New to accent, Good to ok, Fair to warn, Poor and Damaged to bad; user-added ratings stay neutral.

### Data grid (TanStack Table)
Record White panel with a Sunken header band, Caption headers in Ink Three, 56px rows separated by Hairline, hover and selected rows tinted (Paper, Cobalt Mist). Sortable headers are buttons with an arrow; identifiers are mono and link to their record; two-line cells put the name above and its code and department beneath. The footer shows the count and pager. After you add, issue or return, the affected row settles from a Cobalt Mist tint over 1.8 seconds.

### Navigation
Left rail on Slate Rail. Items are 36px, Label weight, Ink Two with an Ink Three icon. The active item becomes a Record White pill with a hairline ring and a cobalt icon. Locked destinations (Users for an Admin) stay in the list with a lock icon and screen-reader text.

### Sheets and dialogs
Issue, Return and edit forms open as a right-hand sheet (480px, full-width on phones) so the table stays visible behind a 35% ink scrim. The header carries title and one-line consequence, the body scrolls, and the footer is pinned on a Paper band with the primary action last. Focus lands on the first field of the task, not on Close. Centred dialogs are reserved for confirmations, the one-time password, and signing in again when a session ends. The last two must be answered, so Escape and a click outside do not close them.

### Quick-add panel
A Record White panel above the register with labelled fields in one row. Enter adds; pasting spreadsheet rows into the first field adds many and lists any skipped rows by number. Replaces the spec's table-row entry line so labels stay visible and fields are real inputs.

### Rich text
The body of a grievance, an action or a note. One field, the "ruled field", chosen over a floating toolbar because every allowed format stays in view and nothing depends on making a selection first.
- **Frame:** the Inputs shape at full size: Record White, 1px Strong Hairline, 8px radius, and the same cobalt border and 3px halo when focus is anywhere inside. In error the border turns Alert Red and the message sits beneath with `role="alert"`, as for any field.
- **Bar:** fixed along the top on a Sunken band with a Hairline rule beneath; it sticks to the top of the scroll area in a long body. 32px ghost icon buttons (Lucide, 16px, 1.75 stroke) in groups split by a short Strong Hairline: bold, italic, underline, strikethrough, link; heading, subheading; bulleted list, numbered list, quote; undo and redo at the far right. A format that applies at the cursor shows Accent Soft with an Accent Line ring and `aria-pressed`. Each button has a tooltip naming it and its shortcut. On a narrow screen the bar wraps to a second row; it never scrolls sideways.
- **Link:** the link button swaps the bar for one address input with Add link, Remove link and Cancel. Enter applies, Escape cancels. A bare address gets `https://`, a bare email `mailto:`; anything else is refused in words.
- **Text:** Body size (14px on a 22px line) at a 65ch measure, blocks 10px apart. Heading 18px/600 and subheading 15px/600, each with more room above than below. Lists indent 24px with Ink 3 markers. A quote is Ink 2 behind a 2px Strong Hairline rule: neutral, never a coloured stripe. Links are cobalt and underlined.
- **Footer:** a Canvas strip with a Hairline rule above: a one-line reminder of what is allowed on the left, the character count against the limit in mono tabular figures on the right. Past the limit the count turns Alert Red and says "over the limit".
- **Reading it back:** the read-only view is the same text rules with no frame, so what was typed looks exactly like what is later read. It only ever shows HTML the server has sanitised.
- **Keyboard:** the bar is a single tab stop; arrow keys, Home and End move along it. Alt+F10 goes from the text to the bar and Escape back. Tab leaves the field, except in a list, where it indents the item.

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
