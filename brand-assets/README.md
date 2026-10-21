# Brightpath source artwork

The five supplied PNGs are unchanged source references. `favicon-1024.png` is actually 1254×1254. Keep original filenames for provenance; publish only curated exports from `web/public/`.

The mark and header SVGs reconstruct the original contours, including lettering, from half-resolution source masks. Pixels require alpha >175; navy selects R<75, G<135, B<170 and orange selects R>190, 85<G<200, B<105. Tiny contours (<20 square pixels) are discarded and retained outlines simplified with 0.9px tolerance. Fills normalize to `#08384F` and `#FF961F`, removing yellow/red fringes, texture, and stray transparent-export pixels. These are reconstructed derivatives, not corporate-supplied vector originals. The header's lettering uses paths, with no font dependency.

`brightpath-browser-icon.svg` simplifies the lighthouse for small icons. `web/public/favicon.svg` matches it; the 16/32px PNGs, 16/32/48px ICO, and 180px touch icon are rendered from this master. Bump the icon query version in `web/index.html` after changing artwork. Keep the master and published copies synchronized.

Use the navy/orange SVGs on light backgrounds. A dark placement needs a light backing or a separately approved inverse export. The full lighthouse remains decorative beside live BPHS-Connect text; the corporate signature is named Brightpath Human Services. The login hero preserves the original composition/texture in a 1916×821 WebP at quality 0.94, rather than approximating it with vector shapes. Its source is `hero-banner.png` and its published path is `/brand/brightpath-hero.webp` (added in Phase 4).

Placement, sizes, visual evidence and rollback details were in `BRAND-UPDATE.md`, since removed; it is in git history before commit `1a562fe`.
