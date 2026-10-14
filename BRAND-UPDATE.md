# BPHS-Connect brand update

Audit date: 2026-10-14. Baseline: `main` at `4a6bf8a`, including the existing local changes described below.

## Objective and status

Use **BPHS-Connect** as the application name, matching **https://bphs-connect.com**. Incorporate the supplied logos, favicons, and related media, then introduce their colors through the existing design tokens while retaining the current layouts, typography, spacing, and component behavior.

**Implementation started 2026-10-14 at `1d2c534`**, the plan-only commit. The original audit baseline was `4a6bf8a`. The 19 prepared name-change diffs have been reviewed and will be included in their relevant phases. The phase ledger below records every delivered change, validation, visual evidence, and rollback method. Earlier audit findings describe the starting state.

`/brand-assets` means the directory at this repository's root. **Five supplied PNGs are present and were inspected.** They show Brightpath / Brightpath Human Services corporate identity with a lighthouse, navy, orange, and cream. They do not contain the application name `BPHS-Connect`; keep that name as readable text beside the compact corporate mark. The files are currently untracked and are not included in this document-only commit.

## Audit coverage

- [x] Check the indexed code with CodeGraph before inspecting implementation details.
- [x] Inventory and search all 195 tracked files plus the existing untracked `SECURITYREVIEW.md` for application-name variants; include hidden design metadata, then inspect all five supplied media files.
- [x] Compare committed source with the working tree, including split JSX text and workspace-dependent branding that a literal phrase search misses.
- [x] Identify media placements, static-file delivery constraints, color tokens, and phased implementation slices.
- [x] Measure the proposed solid-color pairs and inspect the PNG dimensions, transparency, and visible export quality.

Search variants included `BPHS Asset Manager`, `BPHS Asset Management`, `BPHS Assets`, `bphs-asset-manager`, `bphs-assets`, `BPHS Connect`, `BPHS-Connect`, and related app-identity wording. Business terminology and record content are outside this rename inventory. Dependencies, generated builds/caches, the Git database, runtime databases, and private environment/credential files are outside the source audit; generated output should be rebuilt from the updated source.

This is a source-based implementation plan with artwork inspection and computed sRGB contrast measurements. No rendered-screen audit or production-domain verification was performed. The existing ignored `dist/web/index.html` already says `BPHS-Connect`; generated bundles are not an independent source of branding and must be rebuilt for the eventual release. Dependencies, tool telemetry, index caches, and runtime data are not implementation targets.

**Search result:** the visible old application names have already been replaced in the current authored working tree. The committed `main` revision still contains the old names. Remaining old-name matches are the deliberate deployment/repository identifiers below. This report's commit publishes the plan only; it does not publish the prepared rename or media.

## Application-name inventory

Locations refer to the audited working tree. **Prepared locally** means the new text already exists in an uncommitted edit; it does not mean the implementation is shipped.

### Interface and runtime identity

| File and location | Committed identity / purpose | Finding and implementation action |
| --- | --- | --- |
| [web/index.html](web/index.html), line 9 | Initial document title: `BPHS Asset Management` | Prepared locally as `BPHS-Connect`. Retain this fallback title and coordinate the icon/metadata additions described below. |
| [web/src/components/ui/logo.tsx](web/src/components/ui/logo.tsx), lines 3–24 | `Wordmark` composed `BPHS` with a variable product suffix; `LogoMark` draws a placeholder tag glyph | Prepared locally with split JSX spelling `BPHS-Connect`. Replace the placeholder with approved artwork through this shared component. Keep the full application identity constant across workspaces. |
| [web/src/components/shell/app-shell.tsx](web/src/components/shell/app-shell.tsx), lines 242, 260–261, 270 | Desktop wordmark, mobile mark/title, and navigation-drawer wordmark previously depended on the current workspace | Prepared locally with the consistent name. The mobile title is still a separate literal; consolidate the name or shared lockup to prevent future drift. |
| [web/src/lib/session.ts](web/src/lib/session.ts), lines 19–23 | `usePageTitle` default suffix: `BPHS Assets` | Prepared locally as `BPHS-Connect`. Preserve page-specific prefixes, for example `Sign in · BPHS-Connect`. |
| [web/src/features/grievances/page-title.ts](web/src/features/grievances/page-title.ts), lines 3–5 | Workspace titles explicitly overrode the product suffix with `BPHS` | Prepared locally to use the shared default. Expected examples: `Grievances · BPHS-Connect` and `<page> · Grievances · BPHS-Connect`. |
| [web/src/routes/login.tsx](web/src/routes/login.tsx), lines 56, 60 | Shared wordmark and `Use your BPHS Assets account.` | Prepared locally as `Use your BPHS-Connect account.` Artwork changes should flow through `Wordmark`. |
| [web/src/styles.css](web/src/styles.css), line 6 | Design-token header: `BPHS Asset Management` | Prepared locally as `BPHS-Connect`. Actual palette changes are still pending. |
| [server/index.ts](server/index.ts), line 17 | Startup log: `BPHS Asset Management listening…` | Prepared locally as `BPHS-Connect listening…`. Keep the same spelling in operational output. |

### Package identity and documentation

| File and location | Committed identity / purpose | Finding and implementation action |
| --- | --- | --- |
| [package.json](package.json), lines 2, 7 | Package slug `bphs-asset-manager`; description begins `BPHS Asset Management` | Prepared locally as slug `bphs-connect` and display name `BPHS-Connect`. Keep the functional description after the name. |
| [bun.lock](bun.lock), line 6 | Root workspace name `bphs-asset-manager` | Prepared locally as `bphs-connect`. Verify package/lockfile consistency using a frozen install during implementation. |
| [README.md](README.md), line 1 | Main heading `BPHS Asset Management` | Prepared locally as `BPHS-Connect`. Later add a small approved logo and the canonical URL near the introduction. |
| [PRODUCT.md](PRODUCT.md), line 56 | Brand Commitments: `BPHS Asset Management`, short name `BPHS Assets` | Prepared locally with the new name and domain. Still says no logo/colors are supplied; update that statement to refer to the supplied media and selected interface palette. |
| [DESIGN.md](DESIGN.md), lines 2, 156, 270 | Design-system name, heading, and navigation identity | Prepared locally with the new name. Palette definitions and cobalt-specific guidance still describe the existing interface; update them with the implementation. |
| [.impeccable/design.json](.impeccable/design.json), line 4 | Design-system title `Design System: BPHS Asset Management` | Prepared locally as `Design System: BPHS-Connect`. Later synchronize color metadata, scales, and embedded component-preview CSS with the implemented palette. |
| [.impeccable/surfaces/web-src-routes-app-tsx.md](.impeccable/surfaces/web-src-routes-app-tsx.md), lines 8, 12, 18 | Surface-brief title and assumptions about missing artwork / one cobalt accent | Title prepared locally. Replace the missing-logo assumption and update the color contract with the delivered palette. |
| [RUNBOOK.md](RUNBOOK.md), line 1 | Heading `BPHS Asset Management: Runbook` | Prepared locally as `BPHS-Connect: Runbook`. Technical identifiers elsewhere need the separate treatment below. |
| [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md), line 1 | Heading uses `BPHS Connect` without the hyphen | Prepared locally as `BPHS-Connect`. The guide already uses `bphs-connect.com` and `www.bphs-connect.com`; no domain replacement is needed. |
| [featureplan.md](featureplan.md), line 32 | Explicit statement that the product name stays `BPHS Asset Management` | Prepared locally with `BPHS-Connect`. Only this application-name statement belongs to the rename. |
| [implementation.md](implementation.md), line 57 | Browser-title example ends in `Grievances · BPHS` | Prepared locally as `Grievances · BPHS-Connect`. Keep examples consistent with the title helper. |
| [SECURITYREVIEW.md](SECURITYREVIEW.md), line 3 | Existing untracked report already names `BPHS-Connect` | Already consistent. Preserve the report and its reviewed-revision attribution; do not include it in this document's commit. |

### Remaining legacy technical names

These identify the application or its deployment rather than its visible product name. Keep them as compatibility identifiers for the initial brand release; any cleanup belongs in a separate, coordinated operational slice.

| File and location | Remaining reference | Recommended treatment |
| --- | --- | --- |
| [docker-compose.yml](docker-compose.yml), lines 4–5 | Image `bphs-asset-manager:latest`; container `bphs-assets` | Retain initially. An optional image/container rename must be coordinated with the deployed Compose configuration and backup commands. |
| [scripts/backup-offbox.sh](scripts/backup-offbox.sh), lines 5, 11 | Documented and default container name `bphs-assets` | Retain while that container name is used. Update the default and all caller configuration together if the container is renamed later. |
| [RUNBOOK.md](RUNBOOK.md), lines 12, 87, 92, 154–159 | Old image/container names and `/opt/bphs-asset-manager` install path | Preserve commands that match the real installation. Add a short compatibility explanation when updating the runbook's branding. |
| [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md), lines 107–114, 130–132, 210, 324–345, 352–354 | GitHub repository URL, checkout/build path, image name, container references | The Git remote remains `Bytefloww1013/bphs-asset-manager`. Preserve working clone URLs, paths, and deployment commands until an explicit infrastructure migration changes them. |

The guide already uses `bphs-connect` for its production Compose project, configuration directory, public hostnames, and named data volume. Do not infer that all deployment identifiers need a rename. Existing persistence names and browser preference keys do not need to change for this branding work.

### Stale brand assumptions and design notes

Update only the identity/branding passages: [README.md](README.md), line 145, still says no logo or brand color was supplied; [PRODUCT.md](PRODUCT.md), lines 52, 56, and 60, and the surface brief, line 12, still contain missing-logo or unknown-name assumptions. The artwork identifies the corporate brand as Brightpath Human Services; distinguish that identity from the app name `BPHS-Connect`.

[DESIGN.md](DESIGN.md) contains the old cobalt contract in its frontmatter and color, interaction, and navigation guidance, including lines 167–196, 230, 243, 249–256, 268–270, and 280–283. Synchronize those brand/color statements with the CSS and hidden design metadata in the implementation phase. [implementation.md](implementation.md), line 144, records that an orange workspace accent was previously rejected. Preserve that historical record: this proposal uses navy for interactions and orange sparingly in artwork/decoration, without introducing an orange workspace theme. Its line 57 describes a different workspace accent, which does not match the current shared-token implementation; clarify the current behavior when updating that branding note.

## Incorporating the supplied media

### Actual asset inventory

Sizes below are the files' intrinsic dimensions and approximate binary file sizes. All five were visually inspected; transparency was checked from decoded PNG pixels.

| File in `brand-assets/` | Dimensions / size | Artwork and background | Recommended use |
| --- | --- | --- | --- |
| `logo-header-wide.png` | 2172×724; 449 KiB | Transparent horizontal lighthouse + `BRIGHTPATH / HUMAN SERVICES` corporate lockup | Auth-page corporate signature and optional README image. At 3:1 it fits a modest 240–300px width above the form; use the compact mark + app text in the narrow rail. |
| `favicon-1024.png` | **1254×1254**, despite its filename; 351 KiB | Transparent lighthouse without lettering | Source for the shared mark and browser/touch-icon exports. Create smaller exports with suitable clear space; do not send the full-resolution PNG to every header. |
| `logo-light-bg.png` | 1254×1254; 1143 KiB | Opaque textured cream square with navy lighthouse and `BRIGHTPATH` | Optional organization/about material or documentation; a large square would add excess height in navigation. |
| `logo-dark-bg.png` | 1254×1254; 1276 KiB | Opaque dark navy square with cream lighthouse and `BRIGHTPATH / HUMAN SERVICES` | Reserve for an existing dark branded surface or later collateral. Its presence does not require a dark app shell or dark theme. |
| `hero-banner.png` | 1916×821; 1165 KiB | Opaque cream landscape with lighthouse, orange path, and navy waves; no lettering | Optional modest desktop sign-in illustration or generic sharing-image source. Keep it off routine working screens and omit it on narrow layouts if it displaces the form. |

The transparent mark and horizontal logo show yellow/red fringe pixels and some stray pixels around the rays/path at full resolution. Review exports on both white and navy backgrounds, and obtain a clean export from the original artwork before publishing. The favicon's opaque core occupies roughly 51% of the source width and 74% of its height, so simply shrinking the entire square wastes space and makes the lighthouse very small. Export a compact mark with intentional clear space and check 16px/32px legibility; a simplified approved icon may work better at 16px.

No SVG, ICO, 180px touch icon, 192/512px home-screen icon, or official color specification is supplied yet. Existing PNGs are sufficient sources for a restrained update after export cleanup; a clean vector original would improve tiny-size rendering. Keep original files intact and create separately named web derivatives during implementation.

### Source files and published files

Keep supplied originals in repository-root `brand-assets/`. Use the inventory above to select published derivatives; record any later files and usage instructions here when they arrive.

The current Vite root is `web` ([vite.config.ts](vite.config.ts)); its public directory is `web/public`. Root `brand-assets/` is **not automatically copied or served**. Public files are copied into the build unchanged, while imported media can receive hashed names. [Vite static asset documentation](https://vite.dev/guide/assets.html#the-public-directory). Recommended delivery:

1. Keep originals and editable masters in `brand-assets/`.
2. Put only selected, optimized web exports in `web/public/brand/`; serve them as `/brand/<filename>`.
3. Put browser icons in `web/public/` and reference them explicitly from `web/index.html`.
4. Rebuild so those public files reach `dist/web`, which the existing [Dockerfile](Dockerfile) copies into the runtime image.

For frequently rendered component media, `web/src/media/brand/` plus imports is an alternative that uses the configured `/static/` hashed output and immutable cache policy. Choose one delivery convention for component media; fixed browser-icon paths still belong in `web/public/`. Never reference the source directory directly as `/brand-assets/...` in the app.

Suggested export names are placeholders, not claims that these files exist:

| Proposed published file | Purpose |
| --- | --- |
| `web/public/brand/brightpath-header.png` | Optimized horizontal corporate signature from `logo-header-wide.png` |
| `web/public/brand/brightpath-mark.png` | Compact cleaned lighthouse from `favicon-1024.png`, beside live `BPHS-Connect` text |
| `web/public/brand/brightpath-hero.webp` | Optional optimized landscape derived from `hero-banner.png` |
| `web/public/brand/brightpath-mark-mono.png` | Optional approved monochrome derivative for print |
| `web/public/favicon-16.png`, `favicon-32.png` | Explicit size-specific browser icons from the cleaned compact mark |
| `web/public/favicon.ico` | Multi-size fallback from the approved compact artwork |
| `web/public/apple-touch-icon.png` | 180×180 touch icon |
| `web/public/icon-192.png`, `icon-512.png` | Optional home-screen icon set |
| `web/public/brand/bphs-connect-social.png` | Optional 1200×630 generic sharing image |

Use optimized PNG/WebP derivatives for the supplied raster artwork; use SVG if a real vector original is supplied later. Replace the existing `web/public/favicon.svg` link with the actual new icon links and retire the placeholder in the future media slice. Preserve proportions with explicit dimensions and `object-fit: contain`; do not stretch or crop lettering. The corporate artwork does not say `BPHS-Connect`, so retain the live app name even where a corporate signature is shown. Prefer the compact lighthouse + app name for everyday navigation and reserve the long corporate signature for the larger authentication slot.

Proposed export budgets: compact mark under 25 KiB, horizontal signature under 80 KiB, and optional hero under 150 KiB, where quality permits. These are targets for derivatives, not measurements of the originals. Export appropriately sized 1×/2× variants and avoid enlarging smaller artwork. Lazy-load only optional offscreen images; the visible auth wordmark should load immediately.

The server already permits same-origin images through its content security policy ([server/app.ts](server/app.ts), lines 49–64). These files can use the existing static delivery path without introducing a new API or broadening external-image access. If large editable masters are unnecessary for the image build, consider excluding root `brand-assets/` in [.dockerignore](.dockerignore) after curated exports are in `web/public/`; the deployed runtime should need only the published exports.

### Placement map

| Priority | Surface and integration point | How the media fits the current design |
| --- | --- | --- |
| Core | Shared `LogoMark` / `Wordmark` in [logo.tsx](web/src/components/ui/logo.tsx) | Replace the placeholder glyph once. Keep compact and full-lockup variants with a consistent accessible application name. Current mark is 32px. |
| Core | Desktop sidebar and mobile drawer in [app-shell.tsx](web/src/components/shell/app-shell.tsx), lines 242, 270 | Use a cleaned compact lighthouse + live `BPHS-Connect` in the existing 248px rail and drawer header. The corporate horizontal logo becomes too small in this slot. Preserve drawer-close clearance. |
| Core | Mobile header in the same file, lines 256–261 | Use the compact mark at the current 28px size alongside the name, or a short lockup if it fits. Preserve the 56px bar and menu-button space. |
| Core | Sign-in in [login.tsx](web/src/routes/login.tsx), lines 54–57 | Use the shared compact app lockup above the card. Optionally add `logo-header-wide.png` as a 240–300px corporate signature in this existing slot with the app name retained. An optimized `hero-banner.png` may be a later desktop-only illustration, without covering fields or expanding the form. |
| Core | Password setup/change in [password-change.tsx](web/src/routes/password-change.tsx), lines 61–64 | Reuse the same authentication-page lockup and sizing as sign-in; this screen already uses `Wordmark`. |
| Core | Browser tab, bookmark, and touch icon in [web/index.html](web/index.html), lines 7–9 | Replace the placeholder tag favicon, add supplied fallback/touch-icon links, and choose a deliberate `theme-color` consistent with the light interface. |
| Secondary | Session-expiry prompt in [sign-in-again.tsx](web/src/features/auth/sign-in-again.tsx) | Optionally add a compact mark/name to the existing dialog header. Keep the password task prominent and the dialog dimensions stable. |
| Secondary | Standalone error / missing-page states in [__root.tsx](web/src/routes/__root.tsx) | Optionally add a small shared wordmark above the existing message, since these states sit outside the main shell. Keep their contextual error icons. |
| Secondary | Printable grievance case file in [grievances.$code.case-file.tsx](web/src/routes/grievances.$code.case-file.tsx), lines 182–190 | A small monochrome mark/name can fit the repeating document header. Preserve the case identifier, Confidential label, pagination, export stamp, and logged-print flow. |
| Secondary | Repository introduction in [README.md](README.md) | Add one restrained logo image and the canonical domain so onboarding material matches the app. |
| Optional | Link previews configured in [web/index.html](web/index.html) | Add static Open Graph/title/description and a generic branded sharing image if useful. Do not place record details in global sharing metadata. |
| Optional | Home-screen metadata in `web/index.html` and a new `web/public/site.webmanifest` | If desired, use name/short name `BPHS-Connect`, supplied 192/512 icons, and appropriate theme/background colors. Provide a maskable icon only if artwork has the required safe area. This does not require an offline/service-worker feature. |

Give a corporate signature the accessible name `Brightpath Human Services`, matching its lettering. Where a lighthouse sits beside visible `BPHS-Connect` text, treat the mark as decorative (`alt=""` / `aria-hidden`) to avoid duplicate announcements. A standalone app icon can be named `BPHS-Connect`. Treat the hero as decorative. Reserve image dimensions so late loading does not shift navigation or form content. Keep all artwork self-hosted.

## Introducing brand colors without a redesign

The existing interface uses cool neutral surfaces, Geist/Geist Mono, and a restrained cobalt accent. The best fit is to replace the **accent family**, then let existing components inherit it. Preserve the neutral canvas, white panels, text colors, sizes, radii, table density, and spacing for the first release.

### Palette extraction and token mapping

The PNGs contain gradients/texture and do not establish a single official HEX value. Representative samples below are median sRGB values from near-opaque pixels within navy, orange, and cream color ranges, sampled every third column; they are evidence of the color families, not an official brand specification. A later vector or brand guide should take precedence.

| Source | Representative navy / dark background | Representative orange | Representative cream |
| --- | --- | --- | --- |
| `logo-header-wide.png` | `#012A3F` | `#FB9523` | Transparent background |
| `favicon-1024.png` | `#032E46` | `#F8941F` | Transparent background |
| `logo-light-bg.png` | `#042D48` | `#F99129` | `#FEF9F4` |
| `logo-dark-bg.png` | `#122E3E` (background) | `#F79B30` | `#FDF6EE` |
| `hero-banner.png` | `#073653` | `#F8962D` | `#FEF8F1` |

Use **navy as the single interaction accent**, orange in the supplied lighthouse and optional small decorative accents, and cream only in a small branded illustration/signature area. Keep the existing cool neutral canvas and white surfaces for the first release. The following normalized interface values are proposed from those families and have been measured as solid colors; they are not changes made in this pass.

| Existing token / source | Current value | Brand integration |
| --- | --- | --- |
| `--color-accent`, `styles.css:30` | `oklch(0.5 0.19 262)` (approximately `#1e59cd`) | Proposed navy `#08384F`, approximately `oklch(0.323 0.063 235.3)`, for actions, links, and focus. |
| `--color-accent-hover`, line 31 | `oklch(0.44 0.19 262)` | Proposed deeper navy `#062B3E`, approximately `oklch(0.274 0.053 236.2)`. |
| `--color-accent-soft`, line 32 | `oklch(0.96 0.025 262)` | Proposed pale navy tint `#EAF2F5`, approximately `oklch(0.956 0.009 222.1)`. |
| `--color-accent-line`, line 33 | `oklch(0.88 0.06 262)` | Proposed tint `#B8CED9`, approximately `oklch(0.838 0.028 229.2)`, for existing accent borders/selection; it is not a sufficient stand-alone focus boundary on white. |
| `--color-on-accent`, line 34 | Near-white | Proposed `#FFFFFF`; retain a light foreground for primary and danger buttons. |
| `--color-workspace`, line 38 | Alias of `--color-accent` | Let the active workspace label/icon and Confidential line inherit the brand accent. Retain textual workspace cues. |
| `web/index.html:7` | `theme-color="#f5f7f9"` | Prefer the matching neutral shell color for a subtle release; use a brand-colored browser bar only after a mobile visual check. |

If a small decorative treatment is selected, introduce separate `--color-brand-orange: #FF961F` and `--color-brand-warm: #FFF2DE` tokens rather than reusing warning/status colors. Use orange for a short decorative rule or the logo rays/path, with navy text on any warm fill. Optional cream `#FFF8EF` can sit behind a corporate signature. None of these needs to recolor global surfaces or replace the action accent. Keep bright orange out of functional text and focus outlines on light backgrounds.

### Measured proposed color pairs

Ratios were computed using the WCAG sRGB relative-luminance formula, before any opacity, shadows, or browser rendering. Recheck the actual rendered pairs during implementation, especially translucent focus halos and soft borders.

| Foreground / background | Ratio | Assessment |
| --- | --- | --- |
| White `#FFFFFF` / primary navy `#08384F` | 12.43:1 | Strong contrast for primary-button text. |
| White `#FFFFFF` / hover navy `#062B3E` | 14.76:1 | Strong contrast for hover text. |
| Navy `#08384F` / soft tint `#EAF2F5` | 10.96:1 | Suitable for selected labels and links. |
| Navy `#08384F` / cream `#FFF8EF` | 11.80:1 | Suitable for text on a small branded area. |
| Navy `#08384F` / orange `#FF961F` | 5.70:1 | Text can be readable, but a saturated orange action fill is outside the restrained proposal. |
| Bright orange `#FF961F` / white `#FFFFFF` | **2.18:1** | Fails normal/large text and meaningful UI indicator contrast; decorative use only on white. |
| Optional dark orange `#9A4B00` / white `#FFFFFF` | 6.21:1 | An accessible related shade if a secondary text use is later needed; it is not a sampled official brand color. |

Existing uses already cover primary buttons, links, focus rings, control selection, text selection, input carets, accent badges, user initials, and subtle row feedback. Changing the central tokens reaches those surfaces without individually restyling every page. An optional faint rail tint could follow later, after the accent-only release is reviewed; a colored sidebar or new decorative backgrounds are unnecessary for the core update.

### Specific color dependencies to review

- [web/src/components/ui/button.tsx](web/src/components/ui/button.tsx), line 14, hardcodes a cobalt-tinted primary-button shadow (`oklch(0.3 0.1 262 / 0.25)`). Replace its hue with a derived token or a neutral shadow when changing the accent, so a new brand hue does not retain a blue edge.
- The danger variant in the same file, line 19, also uses `text-on-accent`. Choosing a dark foreground for a pale primary color would therefore affect danger buttons too. Prefer a darker accessible primary shade with the existing near-white foreground; if distinct foregrounds are necessary, separate those roles and verify both.
- [web/public/favicon.svg](web/public/favicon.svg) hardcodes `#1e59cd` separately from the CSS palette. Replace the file with the approved icon rather than assuming a token update changes it.
- The current `LogoMark` uses `fill-accent` with a white glyph. A supplied multicolor SVG should preserve its authored fills; do not force its colors through the action token.
- [DESIGN.md](DESIGN.md) duplicates the palette in frontmatter and prose. [.impeccable/design.json](.impeccable/design.json) duplicates color metadata/scales and contains hardcoded preview CSS, including button and navigation examples. Update all representations together; changing only the JSON title or canonical accent value leaves stale examples.
- Form, combobox, editor, and panel shadows also contain hue `262`, but mostly at very low chroma. Keep these neutral for the restrained update unless visual review finds a visible mismatch; avoid blanket numeric replacements.

### Color acceptance rules

Keep supplied artwork faithful. If an exact logo color is too light for text or controls, use a darker related shade for the interface while leaving the logo unchanged. Preserve success, warning, and error roles and their text/icon cues; brand colors should not change the meaning of those states.

Before shipping, measure normal text at least 4.5:1 and large text at least 3:1. [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Meaningful control boundaries and state/focus indicators need at least 3:1 against adjacent backgrounds. [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check default, hover, selected, focused, disabled, and error states. Recheck actual foreground/background pairs rather than carrying forward the existing design document's cobalt figures. Verify focus remains visible and status meaning is understandable in grayscale.

## Phased implementation checklist

Each numbered slice should be reviewable independently. Check a slice only when its changes and acceptance checks are complete. The source/media inventory and proposed palette are recorded; phases 1–3 can now use them, with clean exports required before the media ships. Secondary placements are optional follow-up work. This pass uses this Markdown checklist and does not use Beads.

### Phase 0 — Record the baseline and artwork

- [x] **0.1 Audit and plan:** Record the name inventory, media placements, delivery approach, and color strategy in this document.
- [x] **0.2 Reconcile existing local work:** Review the 19 pre-existing rename diffs and keep unrelated work out of brand commits. Confirm the starting revision before implementing.
- [x] **0.3 Inventory `brand-assets/`:** Record the five actual files, dimensions, backgrounds, transparency, placement recommendations, and export gaps. Identify the compact lighthouse source and horizontal corporate signature.
- [x] **0.4 Record the proposed palette:** Record representative raster color samples, their sources, proposed action/hover/tint values, and computed contrast results; distinguish samples from official color specifications.
- [x] **0.5 Finalize media inputs:** Obtain/prepare clean derivatives for the transparent exports, determine the small-icon treatment, and reconcile any official palette/vector specifications subsequently supplied. Commit the five original PNGs with the future media slice; this document's commit leaves them untracked.

Acceptance: artwork choices and palette sources are traceable; the existing working tree is accounted for.

### Phase 1 — Finish the application-name change

- [ ] **1.1 Shared identity:** Introduce one client-side name source, for example `web/src/lib/brand.ts`, for `BPHS-Connect` and the canonical URL where needed. Use it in the wordmark, mobile title, sign-in copy, and default page-title helper. Keep the static HTML title synchronized explicitly.
- [ ] **1.2 Titles and runtime copy:** Review and finish the prepared name edits in `web/index.html`, `session.ts`, the grievance title helper, `login.tsx`, `app-shell.tsx`, `logo.tsx`, `styles.css`, and `server/index.ts`.
- [ ] **1.3 Package metadata:** Review `package.json` and `bun.lock` together; confirm a frozen lockfile install succeeds with the new root package slug.
- [ ] **1.4 Name verification:** Check sign-in, password change, desktop navigation, mobile header/drawer, and both workspaces' page titles. Search source and design metadata again for the old full names and short aliases; record only intentional legacy identifiers from the compatibility table.

Acceptance: visible application identity and browser-title suffixes consistently read `BPHS-Connect`, independent of workspace. Package metadata and logs agree.

### Phase 2 — Publish logos and browser icons

- [ ] **2.1 Curated exports:** Add the cleaned compact mark and horizontal corporate signature derivatives under `web/public/brand/` (or imported component-media directory), and size-specific browser icons under `web/public/`. Correct the misleading favicon filename in the export inventory, remove fringe/stray pixels in approved derivatives, check light/dark backgrounds, and meet the stated size budgets where quality permits. Preserve and separately commit the original sources.
- [ ] **2.2 Shared components:** Implement compact-mark and full-lockup rendering in `logo.tsx`, including explicit dimensions, meaningful accessible naming, and decorative treatment when text is adjacent.
- [ ] **2.3 Existing placements:** Apply the shared artwork to desktop rail, mobile header, mobile drawer, sign-in, and password change. Check narrow screens and drawer-close clearance without changing the layout structure.
- [ ] **2.4 Browser identity:** Update favicon/fallback/touch-icon links in `web/index.html`. Check 16px/32px favicon legibility and the touch icon at its intended size. Choose and document the browser theme color.
- [ ] **2.5 Delivery verification:** Build and confirm each referenced image exists in `dist/web` and in the Docker runtime output. Fetch the URLs while signed out and confirm the correct image MIME type and bytes, including a nested client route and a reload. A `200` response alone is insufficient: the current server falls back to SPA HTML for missing public paths outside `/static/`.

Acceptance: all existing branding slots show the approved artwork without distortion, duplicated names, layout shifts, or missing-resource fallbacks. Icons refresh in a browser with prior site data.

### Phase 3 — Apply the restrained brand palette

- [ ] **3.1 Accent tokens:** Update accent/action, hover, soft tint, border tint, and foreground tokens in `styles.css` using the proposed measured navy family, reconciled with any later official specification. Keep neutral and status families stable; add separate orange/warm decoration tokens only for a selected small use.
- [ ] **3.2 Dependent styling:** Fix the primary-button shadow, review the shared danger-button foreground, and verify the workspace token follows the chosen accent.
- [ ] **3.3 Component review:** Check buttons, links, inputs, selected controls, badges, user initials, navigation, dialogs, and focus states. Measure contrast on actual background pairs and document the results.
- [ ] **3.4 Responsive comparison:** Capture the same representative screens before and after at desktop, tablet, and phone widths. Confirm the difference is limited to application identity, artwork, and restrained accent color.

Acceptance: the brand hue is recognizable in the logo and existing interaction accents; reading surfaces and workflows retain the current visual structure. Contrast and keyboard focus pass the recorded checks.

### Phase 4 — Synchronize documentation and optional surfaces

- [ ] **4.1 Product/design records:** Finish the name updates in every documentation row above. Replace missing-artwork assumptions in `PRODUCT.md` and the surface brief. Synchronize `DESIGN.md` frontmatter/prose and `.impeccable/design.json` metadata/preview CSS with the implemented colors.
- [ ] **4.2 Onboarding and operations:** Add the approved README logo/domain. Explain retained technical names in `RUNBOOK.md` and `DEPLOY-GUIDE.md` so maintainers do not blindly rename working commands.
- [ ] **4.3 Optional standalone screens:** If selected for this release, add a compact shared identity to session-expiry and standalone error states; verify dialog focus and message prominence.
- [ ] **4.4 Optional printed identity:** If selected, add the approved monochrome identity to the repeating case-file header. Verify grayscale printing, page breaks, Confidential labeling, export attribution, and print logging.
- [ ] **4.5 Optional hero/sharing/home-screen metadata:** If selected, add an optimized desktop sign-in illustration from `hero-banner.png`, a generic sharing-image derivative, and/or a manifest/icon set. Retain app text beside corporate imagery and preserve the sign-in form's prominence. Verify published metadata uses `BPHS-Connect` and the intended domain. Reserve `logo-light-bg.png` / `logo-dark-bg.png` for appropriate optional collateral rather than introducing a new site theme.
- [ ] **4.6 Optional technical-name migration, separate release:** Only if desired, coordinate repository slug, checkout paths, image/container names, deployed Compose overrides, backup defaults/callers, and documentation. Verify backups and rollback commands against the final identifiers. Preserve existing data-volume bindings.

Acceptance: documentation describes the delivered brand and approved assets. Optional slices are explicitly selected or deferred; they do not block the core identity release.

### Phase 5 — Validate and release

- [ ] **5.1 Source checks:** Run the final legacy-name scan, review split JSX/dynamic titles, and check the diff for unrelated changes. Historical audit wording in this document and deliberately retained operational identifiers are expected exceptions.
- [ ] **5.2 Project checks:** Run `bun run typecheck`, `bun run build`, and `bun run test` after implementation. Avoid adding tests that merely duplicate static copy; add targeted regression coverage only where shared identity/title behavior changes justify it.
- [ ] **5.3 Browser checks:** Verify sign-in, password setup/change, navigation at each breakpoint, both workspace title patterns, a session-expiry prompt, and standalone errors. Check keyboard navigation and the shared logo's accessible name.
- [ ] **5.4 Media and cache checks:** Verify favicon refresh, touch icons, image dimensions, correct MIME types, same-origin loading, and no broken requests/CSP violations. Inspect the production build rather than relying only on development serving.
- [ ] **5.5 Release record:** Commit only the approved implementation slices, deploy through the existing process, and verify the released identity at `https://bphs-connect.com` and the intended `www` behavior. Record the release revision and retain the prior code/image for rollback.

Acceptance: all required slices are checked, optional slices are recorded as selected or deferred, and the deployed app consistently presents BPHS-Connect with the approved media and accessible accent palette.

## Open inputs for implementation

| Input | Current status | Resolution |
| --- | --- | --- |
| Logo, mark, favicon, and other supplied media | Five PNGs present, inspected, and currently untracked | Inventory complete. Clean/optimize derivatives and commit original media in slices 0.5 and 2.1. |
| Official exact brand colors / vector originals | Raster samples and measured proposed interface colors recorded; official specification not supplied | Use the documented navy-family proposal, with any later official source taking precedence. Finalize during 0.5 / 3.1. |
| Existing local rename edits | Prepared in 19 files before this task | Review and commit separately during Phase 1; this document-only commit does not publish them. |
| Secondary placements and technical-name cleanup | Recommendations, not required for the core update | Select or defer the optional Phase 4 slices during implementation. |

## Implementation and rollback ledger

Execution date: 2026-10-14. Starting commit: `1d2c534`. All 19 existing tracked diffs are name-only edits reviewed against that commit. The unrelated untracked `.rtk/` and `SECURITYREVIEW.md` stay outside brand commits. No runtime database or secret is committed. Isolated seeded review data lives in `/tmp/bphs-brand-review/data`.

Selected optional work: the desktop login hero (4.5) and small identities on standalone/session screens (4.3). Deferred: printed identity (4.4), sharing images and home-screen manifest (remaining 4.5), and technical-name migration (4.6). Docker runtime verification and deployment require the corresponding environment; their boxes remain open until actually verified.

**Rollback:** each phase has a commit titled `brand: phase N …`. Inspect it with `git show --stat <commit>`. Revert one phase with `git revert <commit>`; for a full rollback, revert phase commits in reverse order, rebuild, and deploy the rebuilt image through the existing process. These changes have no schema migration or data-volume rename. Preserve the deployed pre-update image and revision before release. Do not reset or clean the working tree: the unrelated local report and telemetry must survive.

### Phase 0 — baseline and artwork preparation

Changes:
- `BRAND-UPDATE.md`: reconciled the 19 prepared diffs; recorded execution baseline, optional selections, and rollback procedure; completed 0.2 and 0.5.
- `docs/brand-review/phase0.png`: baseline contact sheet of sign-in, overview, phone drawer, and phone password change. Individual desktop (1440×1000), tablet (834×1112), phone (390×844), and narrow (320×740) captures and reports are in `/tmp/bphs-brand-review/phase0/`.
- Prepared, but not yet published or committed, clean SVG contours for the compact mark and corporate lettering in `/tmp/bphs-brand-review/exports/`. The source gradients are normalized to navy `#08384F` and orange `#FF961F`; retained the original contours, windows, rays, and lettering, removed stray pixel components, and cropped clear space. The hero retains its original textured artwork as a 1440×617 WebP. Original PNGs remain unchanged for Phase 2.

Validation/visual judgment: reviewed the five-source inventory and opened the mark, corporate signature, and hero; checked clean exports on white and navy. Light artwork is intended for light surfaces; it requires a light backing on a navy surface. The existing UI retains its form hierarchy and navigation clearance. Fifteen rendered states passed title, overflow, image-load, external-request, and page-error checks. Frozen offline install succeeded (local Bun 1.4.2; declared package manager remains 1.3.14). Docker Desktop is not integrated with this WSL distro, so no Docker execution has been claimed.

Rollback for Phase 0: revert this documentation/evidence commit; no application code is changed.
