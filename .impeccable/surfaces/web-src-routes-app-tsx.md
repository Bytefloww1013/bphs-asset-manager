---
version: 1
slug: "web-src-routes-app-tsx"
primary_target: "web/src/routes/_app.tsx"
related_targets: ["web/src/styles.css"]
---

# Surface brief: BPHS Asset Management app (all 13 screens)

Mode: Operate. Users are IT staff and Super Admins at desks, in long sessions of repetitive entry, scanning tables for who holds what. Redesign of the "1b dense skin" spec; product truth (screens, rules, terminology) preserved, visual world replaced. Direction pinned by the user: "Comfortable modern". Seed key: none (user-pinned direction; the roll does not apply).

Unresolved: bulk return shares one condition for all rows; dark theme deferred (tokens make it additive); BPHS name expansion and logo not supplied (mark is a placeholder tag glyph).

## Direction contract

THESIS: The record is the product. A calm, trustworthy ledger where rows are the primary object and chrome recedes. Refuses the spec's spreadsheet grid (hairlines on every cell, 9.5-11px type, 19px controls) and the SaaS dashboard of same-size KPI cards.

OWN-WORLD: Cool paper-white ground (oklch 0.975, hue 262) with pure-white record surfaces, one hairline plus a two-layer soft shadow, and a slightly cooler sidebar as the second neutral. Ink and greys measured at 5.5:1 or better. A single cobalt accent used only for primary action, selection and focus. Status tints (green, amber, red, slate) always carry a dot, icon or word. Geist for everything; Geist Mono only for asset tags, serials, employee IDs and timestamps; tabular numerals. 14px body, 12px floor, 56px rows, 36px controls, 8px control and 12px panel radii, lucide icons at 1.75 stroke.

STORY: An administrator opens the app and sees, without scrolling, what needs a decision (assets out over a year, poor condition, low stock); then issues, returns or adds equipment in a couple of keystrokes and sees the row settle. They trust it because rules are visible: disabled actions say why, history is never overwritten.

FIRST VIEWPORT: Overview at 1440x900. 248px sidebar left (grouped nav, user menu pinned bottom). Content: page title and primary "Issue asset" top right; a full-width Inventory panel (one segmented bar, three legend links with counts at 20px, not hero numbers); below, a 7/5 split: "Out the longest" with inline Return buttons and "Free stock by type" bars on the left; Condition watch, Holding the most and Recent activity on the right.

FORM: Operate app shell with left navigation, TanStack Table data grids, slide-over sheets for Issue and Return, inline quick-add panels. Pinned by the user; not drawn from the ranked list.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
