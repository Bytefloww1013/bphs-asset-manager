# BPHS-Connect brand update

Audit date: 2026-10-14. Baseline: `main` at `4a6bf8a`, including the existing local changes described below.

## Objective and status

**Current status: brand update complete.** All required brand slices are implemented, visually reviewed, validated, and committed, including Docker media delivery, native desktop hover, and favicon cache refresh. The user clarified on 2026-10-14 that this task is a brand update only and VPS access is not available yet. Deployment, public DNS/TLS changes, and live-domain verification are outside this task and deferred to separate operational work. Optional print, sharing/manifest, and infrastructure-name work is also deferred.

Use **BPHS-Connect** as the application name, matching **https://bphs-connect.com**. Incorporate the supplied logos, favicons, and related media, then introduce their colors through the existing design tokens while retaining the current layouts, typography, spacing, and component behavior.

**Implementation started 2026-10-14 at `1d2c534`**, the plan-only commit. The original audit baseline was `4a6bf8a`. The 19 prepared name-change diffs were reviewed and included in their relevant phase commits. The phase ledger below records every delivered change, validation, visual evidence, and rollback method. Earlier audit findings describe the starting state.

`/brand-assets` means the directory at this repository's root. **Five supplied PNGs are present and were inspected.** They show Brightpath / Brightpath Human Services corporate identity with a lighthouse, navy, orange, and cream. They do not contain the application name `BPHS-Connect`; keep that name as readable text beside the compact corporate mark. The original PNGs are now preserved in commit `86f40f7`; they were untracked during the original audit.

## Audit coverage

- [x] Check the indexed code with CodeGraph before inspecting implementation details.
- [x] Inventory and search all 195 tracked files plus the existing untracked `SECURITYREVIEW.md` for application-name variants; include hidden design metadata, then inspect all five supplied media files.
- [x] Compare committed source with the working tree, including split JSX text and workspace-dependent branding that a literal phrase search misses.
- [x] Identify media placements, static-file delivery constraints, color tokens, and phased implementation slices.
- [x] Measure the proposed solid-color pairs and inspect the PNG dimensions, transparency, and visible export quality.

Search variants included `BPHS Asset Manager`, `BPHS Asset Management`, `BPHS Assets`, `bphs-asset-manager`, `bphs-assets`, `BPHS Connect`, `BPHS-Connect`, and related app-identity wording. Business terminology and record content are outside this rename inventory. Dependencies, generated builds/caches, the Git database, runtime databases, and private environment/credential files are outside the source audit; generated output should be rebuilt from the updated source.

The initial audit was source-based, with artwork inspection and computed sRGB contrast measurements. Implementation now includes the rendered phase reviews recorded below; production-domain verification remains a release task. The existing ignored `dist/web/index.html` already says `BPHS-Connect`; generated bundles are not an independent source of branding and must be rebuilt for the eventual release. Dependencies, tool telemetry, index caches, and runtime data are not implementation targets.

**Initial audit search result:** visible old application names had been replaced in the prepared working tree while committed `main` still contained them. The phase commits now include the rename and media. Remaining old-name matches are deliberate deployment/repository identifiers and historical audit wording.

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

Export inventory (implemented paths are identified below; optional PNG/sharing/home-screen derivatives remain deferred):

| Proposed published file | Purpose |
| --- | --- |
| `web/public/brand/brightpath-header.svg` | Implemented: clean 1002×295 contour reconstruction from `logo-header-wide.png` (9,608 bytes) |
| `web/public/brand/brightpath-mark.svg` | Implemented: clean 328×471 contour reconstruction from the 1254px source, beside live `BPHS-Connect` text (6,160 bytes) |
| `web/public/brand/brightpath-hero.webp` | Implemented: 1916×821 optimized original landscape from `hero-banner.png`; desktop sign-in uses a left crop (final bytes in Phase 4 ledger) |
| `web/public/brand/brightpath-mark-mono.png` | Optional approved monochrome derivative for print |
| `web/public/favicon-16.png`, `favicon-32.png` | Implemented: 16/32px exports from the simplified browser SVG |
| `web/public/favicon.ico` | Implemented: 16/32/48px PNG entries from the simplified browser SVG |
| `web/public/apple-touch-icon.png` | Implemented: 180×180 touch icon from the simplified browser SVG |
| `web/public/icon-192.png`, `icon-512.png` | Optional home-screen icon set |
| `web/public/brand/bphs-connect-social.png` | Optional 1200×630 generic sharing image |

Use the cleaned SVG mark/signature reconstructed from the supplied outlines, as authorized by the implementation request. Keep the textured hero as optimized WebP. The original PNGs remain the source references; reconstructed vectors are derivatives, not official vector originals. The placeholder `web/public/favicon.svg` is now replaced with the simplified lighthouse; links include SVG/PNG/ICO/touch icons and a refresh version. Preserve proportions with explicit dimensions and `object-fit: contain`; do not stretch or crop lettering. The corporate artwork does not say `BPHS-Connect`, so retain the live app name even where a corporate signature is shown. Prefer the compact lighthouse + app name for everyday navigation and reserve the long corporate signature for the larger authentication slot.

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

- [x] **1.1 Shared identity:** Introduce one client-side name source, for example `web/src/lib/brand.ts`, for `BPHS-Connect` and the canonical URL where needed. Use it in the wordmark, mobile title, sign-in copy, and default page-title helper. Keep the static HTML title synchronized explicitly.
- [x] **1.2 Titles and runtime copy:** Review and finish the prepared name edits in `web/index.html`, `session.ts`, the grievance title helper, `login.tsx`, `app-shell.tsx`, `logo.tsx`, `styles.css`, and `server/index.ts`.
- [x] **1.3 Package metadata:** Review `package.json` and `bun.lock` together; confirm a frozen lockfile install succeeds with the new root package slug.
- [x] **1.4 Name verification:** Check sign-in, password change, desktop navigation, mobile header/drawer, and both workspaces' page titles. Search source and design metadata again for the old full names and short aliases; record only intentional legacy identifiers from the compatibility table.

Acceptance: visible application identity and browser-title suffixes consistently read `BPHS-Connect`, independent of workspace. Package metadata and logs agree.

### Phase 2 — Publish logos and browser icons

- [x] **2.1 Curated exports:** Add the cleaned compact mark and horizontal corporate signature derivatives under `web/public/brand/` (or imported component-media directory), and size-specific browser icons under `web/public/`. Correct the misleading favicon filename in the export inventory, remove fringe/stray pixels in approved derivatives, check light/dark backgrounds, and meet the stated size budgets where quality permits. Preserve and separately commit the original sources.
- [x] **2.2 Shared components:** Implement compact-mark and full-lockup rendering in `logo.tsx`, including explicit dimensions, meaningful accessible naming, and decorative treatment when text is adjacent.
- [x] **2.3 Existing placements:** Apply the shared artwork to desktop rail, mobile header, mobile drawer, sign-in, and password change. Check narrow screens and drawer-close clearance without changing the layout structure.
- [x] **2.4 Browser identity:** Update favicon/fallback/touch-icon links in `web/index.html`. Check 16px/32px favicon legibility and the touch icon at its intended size. Choose and document the browser theme color.
- [x] **2.5 Delivery verification:** Build and confirm each referenced image exists in `dist/web` and in the Docker runtime output. Fetch the URLs while signed out and confirm the correct image MIME type and bytes, including a nested client route and a reload. A `200` response alone is insufficient: the current server falls back to SPA HTML for missing public paths outside `/static/`.

Acceptance: all existing branding slots show the approved artwork without distortion, duplicated names, layout shifts, or missing-resource fallbacks. Icons refresh in a browser with prior site data.

### Phase 3 — Apply the restrained brand palette

- [x] **3.1 Accent tokens:** Update accent/action, hover, soft tint, border tint, and foreground tokens in `styles.css` using the proposed measured navy family, reconciled with any later official specification. Keep neutral and status families stable; add separate orange/warm decoration tokens only for a selected small use.
- [x] **3.2 Dependent styling:** Fix the primary-button shadow, review the shared danger-button foreground, and verify the workspace token follows the chosen accent.
- [x] **3.3 Component review:** Check buttons, links, inputs, selected controls, badges, user initials, navigation, dialogs, and focus states. Measure contrast on actual background pairs and document the results.
- [x] **3.4 Responsive comparison:** Capture the same representative screens before and after at desktop, tablet, and phone widths. Confirm the difference is limited to application identity, artwork, and restrained accent color.

Acceptance: the brand hue is recognizable in the logo and existing interaction accents; reading surfaces and workflows retain the current visual structure. Contrast and keyboard focus pass the recorded checks.

### Phase 4 — Synchronize documentation and optional surfaces

Selection: 4.3 standalone/session identity and the 4.5 desktop hero are delivered. 4.4 printed identity, 4.5 sharing/home-screen metadata, and 4.6 infrastructure-name migration are **deferred**, with no changes to those surfaces.

- [x] **4.1 Product/design records:** Finish the name updates in every documentation row above. Replace missing-artwork assumptions in `PRODUCT.md` and the surface brief. Synchronize `DESIGN.md` frontmatter/prose and `.impeccable/design.json` metadata/preview CSS with the implemented colors.
- [x] **4.2 Onboarding and operations:** Add the approved README logo/domain. Explain retained technical names in `RUNBOOK.md` and `DEPLOY-GUIDE.md` so maintainers do not blindly rename working commands.
- [x] **4.3 Optional standalone screens:** If selected for this release, add a compact shared identity to session-expiry and standalone error states; verify dialog focus and message prominence.
- [ ] **4.4 Optional printed identity:** If selected, add the approved monochrome identity to the repeating case-file header. Verify grayscale printing, page breaks, Confidential labeling, export attribution, and print logging.
- [x] **4.5 Optional hero/sharing/home-screen metadata:** If selected, add an optimized desktop sign-in illustration from `hero-banner.png`, a generic sharing-image derivative, and/or a manifest/icon set. Retain app text beside corporate imagery and preserve the sign-in form's prominence. Verify published metadata uses `BPHS-Connect` and the intended domain. Reserve `logo-light-bg.png` / `logo-dark-bg.png` for appropriate optional collateral rather than introducing a new site theme.
- [ ] **4.6 Optional technical-name migration, separate release:** Only if desired, coordinate repository slug, checkout paths, image/container names, deployed Compose overrides, backup defaults/callers, and documentation. Verify backups and rollback commands against the final identifiers. Preserve existing data-volume bindings.

Acceptance: documentation describes the delivered brand and approved assets. Optional slices are explicitly selected or deferred; they do not block the core identity release.

### Phase 5 — Validate and record the brand update

- [x] **5.1 Source checks:** Run the final legacy-name scan, review split JSX/dynamic titles, and check the diff for unrelated changes. Historical audit wording in this document and deliberately retained operational identifiers are expected exceptions.
- [x] **5.2 Project checks:** Run `bun run typecheck`, `bun run build`, and `bun run test` after implementation. Avoid adding tests that merely duplicate static copy; add targeted regression coverage only where shared identity/title behavior changes justify it.
- [x] **5.3 Browser checks:** Verify sign-in, password setup/change, navigation at each breakpoint, both workspace title patterns, a session-expiry prompt, and standalone errors. Check keyboard navigation and the shared logo's accessible name.
- [x] **5.4 Media and cache checks:** Verify favicon refresh, touch icons, image dimensions, correct MIME types, same-origin loading, and no broken requests/CSP violations. Inspect the production build rather than relying only on development serving.
- [x] **5.5 Brand-update completion record:** Commit the implemented brand slices, record the validated code/build revisions and phase rollback instructions, and explicitly defer VPS deployment and live-domain verification in accordance with the user’s clarified scope.

Acceptance: all required brand slices are checked, optional work is recorded as selected or deferred, and the validated local production build/runtime consistently presents BPHS-Connect with the approved artwork and accessible accent palette. Live deployment is a separate future task.

## Open inputs for implementation

| Input | Current status | Resolution |
| --- | --- | --- |
| Logo, mark, favicon, and other supplied media | Five PNGs preserved unchanged in `86f40f7`; SVG masters and web derivatives implemented | Originals and clean SVG exports delivered; optimized hero added in Phase 4. |
| Official exact brand colors / vector originals | Raster samples and measured proposed interface colors recorded; official specification not supplied | Use the documented navy-family proposal, with any later official source taking precedence. Finalize during 0.5 / 3.1. |
| Existing local rename edits | Prepared in 19 files before this task | Reviewed: runtime/package edits committed in Phase 1; documentation edits committed in Phase 4. |
| Secondary placements and technical-name cleanup | Recommendations, not required for the core update | Selected: hero and standalone/session identity. Print, sharing/manifest, and infrastructure-name migration are deferred. |

## Implementation and rollback ledger

Execution date: 2026-10-14. Starting commit: `1d2c534`. All 19 existing tracked diffs are name-only edits reviewed against that commit. The unrelated untracked `.rtk/` and `SECURITYREVIEW.md` stay outside brand commits. No runtime database or secret is committed. Isolated seeded review data lives in `/tmp/bphs-brand-review/data`.

Selected optional work: the desktop login hero (4.5) and small identities on standalone/session screens (4.3). Deferred: printed identity (4.4), sharing images and home-screen manifest (remaining 4.5), and technical-name migration (4.6). Docker runtime verification is complete. VPS deployment is explicitly outside this brand-update task, as clarified by the user; it is a separate future operation.

**Rollback:** each phase has a commit titled `brand: phase N …`. Inspect it with `git show --stat <commit>`. Revert one phase with `git revert <commit>`; for a full rollback, revert phase commits in reverse order, rebuild, and deploy the rebuilt image through the existing process. These changes have no schema migration or data-volume rename. Preserve the deployed pre-update image and revision before release. Do not reset or clean the working tree: the unrelated local report and telemetry must survive.

### Phase 0 — baseline and artwork preparation

Changes:
- `BRAND-UPDATE.md`: reconciled the 19 prepared diffs; recorded execution baseline, optional selections, and rollback procedure; completed 0.2 and 0.5.
- `docs/brand-review/phase0.png`: baseline contact sheet of sign-in, overview, phone drawer, and phone password change. Individual desktop (1440×1000), tablet (834×1112), phone (390×844), and narrow (320×740) captures and reports are in `/tmp/bphs-brand-review/phase0/`.
- Prepared, but not yet published or committed, clean SVG contours for the compact mark and corporate lettering in `/tmp/bphs-brand-review/exports/`. The source gradients are normalized to navy `#08384F` and orange `#FF961F`; retained the original contours, windows, rays, and lettering, removed stray pixel components, and cropped clear space. The hero retains its original textured artwork as a 1440×617 WebP. Original PNGs remain unchanged for Phase 2.

Validation/visual judgment: reviewed the five-source inventory and opened the mark, corporate signature, and hero; checked clean exports on white and navy. Light artwork is intended for light surfaces; it requires a light backing on a navy surface. The existing UI retains its form hierarchy and navigation clearance. Fifteen rendered states passed title, overflow, image-load, external-request, and page-error checks. Frozen offline install succeeded (local Bun 1.4.2; declared package manager remains 1.3.14). Docker Desktop is not integrated with this WSL distro, so no Docker execution has been claimed.

Rollback for Phase 0: revert this documentation/evidence commit; no application code is changed.

### Phase 1 — one application identity

Phase 0 commit: `13ac05f`.

Changes:
- Added `web/src/lib/brand.ts` with the app name, canonical URL, and corporate accessible name.
- `web/src/components/ui/logo.tsx`: removed the workspace-specific name prop; preserved the two-weight wordmark while deriving its text from the shared name.
- `web/src/components/shell/app-shell.tsx`: desktop/drawer wordmarks use constant app identity; mobile heading uses the shared name; removed the workspace-dependent product suffix.
- `web/src/routes/login.tsx`: account copy uses the shared name.
- `web/src/lib/session.ts`: title helper uses the shared name without an overriding workspace product argument.
- `web/src/features/grievances/page-title.ts`: keeps the grievance/page prefixes and uses the shared product suffix.
- `web/index.html`, `server/index.ts`, `web/src/styles.css`: reviewed and included the prepared static title, startup-log name, and token-header name edits.
- `package.json`, `bun.lock`: included the prepared `bphs-connect` root slug and package description together.
- `docs/brand-review/phase1.png`: same-state visual comparison against the reviewed working-tree baseline.

Validation/visual judgment: typecheck/build and frozen offline lockfile install pass. Fifteen production-rendered states pass; sign-in, voluntary and forced password change, rail, mobile heading/drawer, and both workspace titles consistently use BPHS-Connect. Grievance detail retains its page-specific title prefix. Full comparisons and phone captures show unchanged fonts, spacing, form geometry, and navigation clearance; this phase consolidates the already-prepared name. Legacy scan finds only documented repository/image/container/path identifiers outside the audit's historical wording. No page errors, broken images, external requests, or horizontal overflow.

Rollback for Phase 1: revert its commit to restore the previous app/package names, workspace-dependent wordmarks, and title suffixes; rebuild. Documentation rename edits remain for Phase 4.

### Phase 2 — shared artwork and browser identity

Phase 1 commit: `dc25662`. Original-source preservation has its own commit, followed by this phase's implementation commit.

Changes:
- Committed the five unchanged originals: `brand-assets/logo-header-wide.png`, `favicon-1024.png`, `logo-light-bg.png`, `logo-dark-bg.png`, and `hero-banner.png`. The misleading favicon filename is retained only for source provenance; its actual dimensions are 1254×1254.
- Added editable SVG masters `brand-assets/brightpath-mark.svg` (328×471), `brightpath-header.svg` (1002×295), and `brightpath-browser-icon.svg` (32×32). The mark/signature preserve traced source outlines and lettering with flat navy/orange fills; the browser icon deliberately simplifies the lantern, tower, rays, and orange path for 16px legibility. `brand-assets/README.md` records the derivation and intended backgrounds.
- Published identical mark/signature copies at `web/public/brand/brightpath-mark.svg` (6,160 bytes) and `brightpath-header.svg` (9,608 bytes).
- Replaced the placeholder `web/public/favicon.svg` (518 bytes); added `favicon-16.png` (621 bytes), `favicon-32.png` (1,092 bytes), `favicon.ico` (16/32/48 embedded PNGs; 3,577 bytes), and `apple-touch-icon.png` (180×180; 7,369 bytes).
- `web/src/components/ui/logo.tsx`: shared dimensioned image mark, decorative by default with an optional standalone label; retained live app wordmark; added `AuthBrand` with the 260px corporate signature named Brightpath Human Services and live BPHS-Connect text below it.
- `web/src/routes/login.tsx`, `password-change.tsx`: replaced their shared authentication identity with `AuthBrand`. The existing rail, mobile header, and drawer inherit the compact artwork through `LogoMark`/`Wordmark` without layout changes.
- `web/index.html`: versioned SVG/PNG/ICO favicon and touch-icon links (`v=20261014`). Kept neutral browser theme `#f5f7f9`, checked with the light phone shell.
- Added `docs/brand-review/phase2.png`, `artwork.png`, and `icons.png` as visual evidence.

Validation/visual judgment: build/typecheck pass. Fifteen rendered states have no overflow, broken artwork, external requests, or page errors. Full comparison plus full-size phone sign-in/drawer views show crisp, proportionate marks and corporate lettering, one readable application identity, stable form width/spacing, and clear drawer-close space. The corporate signature intentionally increases only the authentication identity area's height; all fields fit the 390px phone view. Simplified icons are recognizable at 16/32px and the touch icon is crisp at 180px. All seven published files match source and built bytes by SHA-256 when fetched signed out, return image MIME types and `no-cache`, and load after a protected nested-route redirect/reload. Versioned URLs avoid reusing the previous placeholder's cache key.

At the Phase 2 commit, slice 2.5 was **partially verified** (the runtime follow-up below now closes it): production `dist/web` delivery and MIME/byte checks passed; the Dockerfile copies that exact directory to its runtime stage, but Docker execution remains unavailable in WSL. The box remains open for an actual runtime-image check. No live deployment has occurred.

Rollback for Phase 2: revert the implementation commit to restore the previous tag mark and favicon links. The separate original-source commit can remain for reference, or be reverted independently. Rebuild to remove published derivatives from deployment.

### Phase 3 — restrained navy accent

Original-source commit: `86f40f7`. Phase 2 implementation commit: `9373d94`.

Changes:
- `web/src/styles.css`: action `#08384F`, hover `#062B3E`, soft fill `#EAF2F5`, accent border/selection `#B8CED9`, foreground `#FFFFFF`; updated the contrast/workspace comments and added `--shadow-primary` with a navy shadow. Every neutral, ink, workspace alias, status, typography, spacing, radius, and motion value is unchanged (verified against Phase 2).
- `web/src/components/ui/button.tsx`: replaced the hardcoded cobalt shadow with `shadow-primary`. The danger button retains its red fill and now inherits pure white text.
- Added `docs/brand-review/phase3.png`, `contrast.json`, and `login-errors.png` as comparison, measured-pair, and error-state evidence.

Validation/visual judgment: built and opened the same 15 responsive states; compared Phase 2/3 in one board. Reviewed live quick-add fields, status badges, selected filter, links, initials, workspace navigation, password form, validation errors, and an unsubmitted danger sheet. Composition, fonts, dimensions, density, neutral surfaces, and green/amber/red meanings are preserved. Navy now ties actions and navigation to the lighthouse. Focused input borders remain clearly navy; keyboard focus remains visible.

Rendered solid-color measurements: white/action 12.43:1; white/hover 14.76:1; navy/white workspace and links 12.43:1; navy/soft initials 10.96:1; focused navy border/white 12.43:1; input ink/white 17.77:1; white/red danger 7.47:1. The light accent border is a tint, not a standalone focus indicator; the solid navy boundary carries focus. The browser profile reports `hover: none` even with mouse events, so the hover **color** was rendered by applying the implemented hover token for measurement; native hover media-query behavior on physical desktop hardware is a remaining manual check. Disabled/error states retain textual meaning. No page errors, broken images, overflow, or external image/font requests.

Rollback for Phase 3: revert its commit to restore the cobalt action family, near-white foreground, and prior primary-button shadow. No media or data is affected.

### Phase 4 — documentation, hero, and secondary identity

Phase 3 commit: `1707942`.

Changes:
- `web/public/brand/brightpath-hero.webp`: optimized original-resolution 1916×821 hero, quality 0.94, 57,502 bytes. Preserves supplied composition and texture; the first 1440px export was improved after a direct visual comparison showed softer rays. `brand-assets/README.md` now records the final export.
- `web/src/routes/login.tsx`: added the decorative, dimensioned hero to a desktop-only left column; preserved the 416px form in the right column and the centered tablet/phone form. Illustration is 512px high with a left crop and existing panel radius. No new marketing copy or working-screen imagery.
- `web/src/features/auth/sign-in-again.tsx`: small shared wordmark above the existing session-expiry title, preserving dialog width, password autofocus, focus trap, and resumption behavior.
- `web/src/routes/__root.tsx`: shared standalone identity/title wrapper for missing-page and error states; contextual icons and recovery messages retained. Also fixed the existing Try again action to reset the error boundary **and invalidate the router**, so a failed loader is retried. This extra behavior change is isolated in `StandaloneError` and can be reverted independently by restoring the prior error component.
- `DESIGN.md`: finished prepared name edits, synchronized frontmatter and all active cobalt prose to navy/hover/tints, corrected contrast figures, described the shared workspace token, and documented artwork/authentication dimensions and the primary shadow.
- `.impeccable/design.json`: finished prepared title edit; synchronized canonical accent values, display names, derived tonal ramps, all embedded preview CSS (including focus halo and primary shadow), narrative, shadow metadata, and brand provenance/paths. Neutral/status metadata remains stable. Preview ramps are clearly identified as derived values, not official corporate colors.
- `PRODUCT.md`: recorded the corporate identity, supplied artwork, navy palette, canonical URL, and local evidence; removed the missing-artwork assumptions.
- `.impeccable/surfaces/web-src-routes-app-tsx.md`: finished title edit and synchronized artwork assumptions, direction contract, and branding placements.
- `README.md`: finished name edit, added a restrained 280px signature/domain, and replaced the obsolete placeholder-logo gap with provenance/rollback information.
- `RUNBOOK.md`, `DEPLOY-GUIDE.md`: finished name edits and added a compatibility explanation preserving repository, checkout, image, container, service, backup callers, and volume bindings.
- `featureplan.md`: included the prepared app-name statement. `implementation.md`: finished the browser-title example and corrected the current shared workspace accent; retained the historical note rejecting an orange workspace theme.
- `BRAND-UPDATE.md`: synchronized delivered export inventory/current inputs, recorded optional deferrals, and added this ledger.
- Added `design-qa.md` and visual/evidence files `docs/brand-review/phase4.png`, `phase4-details.png`, `phase4-details-before.png`, `login-desktop.png`, `login-phone.png`, `standalone-error-phone.png`, and `extra-checks.json`.

Validation/visual judgment: build/typecheck pass; 15 representative responsive states plus focused artwork, error, and session checks pass. Compared source hero/signature and rendered elements in one normalized input; the higher-quality hero resolves the earlier softness finding. Desktop layout is balanced and the fields stay prominent; tablet/phone match the prior centered form. Session dialog identity stays secondary to its task and fits the phone viewport. Verified Password autofocus, tab containment, Escape behavior, successful reauthentication to the same record, missing-page return, and actual error retry after restoring a synthetic failed endpoint. Source CSS, DESIGN frontmatter, design metadata, tonal ramps, and embedded preview colors agree. Local visual QA passes; release environment gaps remain open.

Rollback for Phase 4: revert its commit to remove the hero and secondary identities and restore prior documentation. To undo only the recovery fix, restore the prior error component in `__root.tsx` (the reset-only handler) while keeping `StandaloneState`. No record, print, backup, or infrastructure behavior is otherwise changed.

### Phase 5 — local validation and release candidate

Phase 4 / implemented release-candidate revision: `48e07bb`. The Phase 5 commit records validation only; it changes no application behavior.

Changes:
- `BRAND-UPDATE.md`: checked completed local validation slices, clarified current/historical status, retained open Docker/deployment checks, and recorded this final phase and commit map.
- `design-qa.md`: final local sign-off includes project-check results and the same release gaps.
- `docs/brand-review/phase5.png`: fresh production-build comparison against Phase 4; no new visual differences beyond synthetic last-login/timestamp data.
- `docs/brand-review/media-report.json`: final eight-file MIME, byte count, SHA-256, signed-out nested-route reload, versioned icon URLs, PNG dimensions, and empty CSP-event/error evidence.

Validation:
- `bun run typecheck`: passed for client and server.
- `bun run build`: passed; all public media present in `dist/web` and fetched from the production Node server.
- `bun run test`: **176/176 tests passed across 10 files** outside the sandbox. Initial sandbox run had 174 passes and two CLI subprocess-output failures; rerunning the complete suite with the required permission passed without code/test changes. Logs: `/tmp/bphs-brand-review/final-{typecheck,build,test-unsandboxed}.log`.
- Final legacy-name scan: no old visible application names in authored app/package/design sources. Matches in Compose, backup defaults, repository/checkout references, and compatibility notes are intentional. Historical wording in this audit and the preserved unrelated security report are excluded.
- Fifteen final responsive states plus drawer, password setup/change, record title, session expiry, and standalone error checks pass. Final screenshots were opened and compared; no unintended layout/type/status changes, broken images, external artwork/font requests, or horizontal overflow. Native physical-device hover and browser-chrome favicon display remain manual checks; actual hover token contrast, icon URLs, image bytes, and icon dimensions are verified.
- Final media delivery: eight byte-identical image responses, correct image MIME types and `no-cache`; signed-out nested reload works; all five icon links include the refresh version; no CSP console errors or security-policy violation events on the checked page.
- Tracked working tree is clean after this commit; only the original unrelated `.rtk/` and `SECURITYREVIEW.md` remain untracked.

**Scope clarified after validation:** the user confirmed this is a brand update only. The runtime follow-up closes 2.5 and the completion record closes 5.5. A future deployment should follow DEPLOY-GUIDE.md, including backup, prior-image/revision retention, and live DNS/TLS/www checks; those are not brand-update acceptance requirements.

Rollback for Phase 5: revert this validation-only commit to remove its evidence/status updates. For the delivered app, revert Phase 4→3→2→1 in reverse order and rebuild; the original artwork commit can remain or be reverted separately. Keep the prior production image/commit before deployment, as release checks still require.

### Commit map

| Slice | Commit | Revert effect |
| --- | --- | --- |
| Phase 0 | `13ac05f` | Removes baseline documentation/evidence only. |
| Phase 1 | `dc25662` | Restores previous application/package identity and title behavior. |
| Original artwork | `86f40f7` | Removes the five source PNGs only; published derivatives are separate. |
| Phase 2 | `9373d94` | Restores placeholder logos/browser icons and authentication lockup. |
| Phase 3 | `1707942` | Restores cobalt accent/foreground/button shadow. |
| Phase 4 | `48e07bb` | Removes hero/secondary identity/retry fix and restores prior documentation. |
| Phase 5 | `9ff3e69` | Removes final evidence/status only. |
| Runtime follow-up | `77441ec` | Removes Docker/desktop/cache evidence and status updates only. |

### Runtime follow-up — close Docker and desktop verification

Source/build revision: `9ff3e69`. No app, server, dependency, Dockerfile, infrastructure configuration, or source artwork changed in this follow-up. The application tree still matches the tested revision.

Changes:
- `BRAND-UPDATE.md`: completed 2.5, updated current release status and the Phase 5 commit ID, and recorded the verification/remaining deployment evidence.
- `design-qa.md`: completed Docker and real desktop hover/cache checks; retained only the production release gate.
- Added `docs/brand-review/desktop-hover.png` and `desktop-runtime.json`: headed Chromium/WSLg screenshot and actual hover/cache evidence. No CSS injection or hover media override is used. Real desktop media reports hover/fine pointer; the button changes from `rgb(8,56,79)` to `rgb(6,43,62)` with white text. The prior placeholder is cached for one year at the old unversioned URL; it remains cached while the new versioned SVG returns the exact new bytes and survives reload. The old URL hit the fixture server only once. Current app requests use the unchanged production build through a local proxy.
- Added `docs/brand-review/docker-runtime.json`: actual healthy Linux/amd64 runtime image, non-root Node v24.21.0 process, eight exact media files, image MIME/cache headers, signed-out API response, and nested-route/reload shell hashes.
- Added `docs/brand-review/release-probe.json`: failed public HTTPS probes without bypassing certificate validation, and current environment resolver results compared with the guide's VPS.

Docker verification: the Linux WSL wrapper initially lacked a running engine. Started the installed Docker Desktop through its Windows CLI, without changing WSL integration or Docker configuration. Built the repository's unchanged Dockerfile from `git archive 9ff3e69` (only committed input, filtered by .dockerignore), including its declared Bun 1.3.14 frozen install and production build. Image tag `bphs-connect-brand-review:9ff3e69`; image/repository digest `sha256:cb270235e37436b4e71c988afd3d77bc76e882872832bea77fb48ebde365a2d2`. Ran a labeled disposable container with no host port exposed; `/api/health` passed and Docker reported healthy. Signed-out `/api/auth/me` correctly returned 401, while all eight artwork URLs returned 200/image content byte-identical to both source and runtime files. `/login` and the nested grievance URL/reload returned the exact runtime SPA shell with BPHS-Connect title and versioned icons. Stopped only the owned container; `--rm` removed it and its anonymous review-data volume. The built image is retained locally for reuse. Docker Desktop remains running; no other containers or images were removed.

Visual judgment: opened the headed 1440×1000/DPR 1 hover capture. The hero stays sharp, proportions/form hierarchy remain intact, and the actual hover fill visibly deepens as intended. Earlier headless-only hover/cache gaps are closed; the original screenshots/measurements remain historical evidence. No unexpected page errors in the real desktop check.

Release evidence: the first HTTPS probes rejected a certificate named `testexp` for both hostnames; later probes timed out (curl exit 28). The current resolver returns `204.11.56.246` for apex and www, differing from the guide's `50.6.205.113`. These observations do not identify the source of the certificate/access failures and do not verify a production deployment. These observations belong to future deployment work. The user subsequently clarified that VPS deployment is outside this task, so they do not block brand-update completion.

Rollback: revert this verification-only commit to remove its evidence/status changes; application behavior is unaffected. To discard the local review image, first confirm its recorded tag/digest and that nothing uses it, then remove that specific image. Keep the existing phase rollback sequence for the application. No new test or source edits were required.

### Completion record — brand-only scope

User clarification, 2026-10-14: “You do not have access to the VPS yet, this was meant to just be a brand update.” This supersedes the original plan’s inclusion of deployment in Phase 5. The brand implementation and validation are complete; no VPS access or production action is required to finish this task.

Changes:
- `BRAND-UPDATE.md`: updated the current status, Phase 5 title/acceptance, and 5.5 completion slice to the clarified brand-only scope; recorded deployment as separate future work; added the runtime follow-up commit to the rollback map.
- `design-qa.md`: removed live deployment as an unfinished brand acceptance item while retaining the earlier probes as historical context for future operations.

Completion evidence: application implementation revision `48e07bb`; final validation/build revision `9ff3e69`; Docker/desktop/cache verification record `77441ec`. The app source has not changed since the passing client/server typecheck, production build, and 176/176 tests. Required slices 0–5 are checked, optional print/technical-name work remains explicitly deferred, each phase has its commit, visual reviews are saved, and every change has a rollback entry. The desktop hero, recreated SVG branding, browser icons, shared identity, navy palette, and documentation are delivered.

Rollback for this completion-record commit: revert it to restore the prior scope/status wording only. Use the existing phase commits to revert any implementation change.
