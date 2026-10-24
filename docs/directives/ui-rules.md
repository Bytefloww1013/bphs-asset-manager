---
description: Hard UI rules for every page and component, distilled from DESIGN.md and PRODUCT.md; hide what the user can't access
scope: root
covers: [ui, design, hidden, disabled, placeholder, accessibility, components, icons, keyboard, sheets, dialogs, typography, color, motion, permissions]
---

# UI rules

`DESIGN.md` is the full design system and `PRODUCT.md` the product principles; read the relevant section before building a screen. These rules never bend:

## Permissions and state

- Hide what the user has no permission for. A page, section, tab, nav entry, button or menu option the user's access doesn't allow is not rendered at all: from their point of view it doesn't exist. No disabled placeholder, no lock icon, no "ask an admin" hint.
- Gray out and disable an element in only two cases:
  - it is a placeholder for a page or feature that isn't built yet; say so in words (`Coming soon`);
  - the user has the permission, but a record rule blocks the action (deleting an asset with custody history, returning one already returned); show the rule in words.
- This overrides `DESIGN.md` ("Don't hide a control the user may not use") and principle 4 in `PRODUCT.md`.
- Every status is a word plus a dot or icon; never color alone.

## Look

- Text people read or scan is 14px; 12px only for metadata. Every text pair meets 4.5:1 contrast.
- Identifiers, timestamps and counts in Geist Mono or tabular figures; never mono on labels or sentences.
- Icons are Lucide only: no emoji or Unicode glyphs, keyboard hints included.
- No colored side stripes on rows, cards or alerts; a row highlight is a tint.
- The accent is never decoration, a heading color or a status fill.
- Overviews lead with what needs a decision, not a grid of KPI cards or hero numbers.

## Interaction

- Controls 36px (32px inside rows, 24px minimum target); rows 56px; visible keyboard focus.
- Focused tasks open in the right-hand sheet; centered dialogs are for confirmations only.
- The common path is keyboard-complete: Enter adds, Shift+Enter adds another, I issues from a focused row, Ctrl/Cmd+Enter submits a sheet.
- Motion only for sheet entry, menu pop-ins, the row settle and the pages panel fold; honor `prefers-reduced-motion`.
- Fonts and icons are self-hosted: the app must work with no internet.
- TanStack `Link` sets `aria-current="page"` itself; for another value spread `useLinkProps` onto an `<a>` and set `aria-current` last.
