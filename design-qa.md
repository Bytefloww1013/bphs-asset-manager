# BPHS-Connect brand implementation review

Final result: passed

This is the local visual/interaction result. The Docker runtime, actual desktop hover, and stale-icon cache checks now pass. The user clarified that VPS deployment and public DNS/TLS verification are outside this brand-update task. All required brand acceptance checks are complete.

**Source visual truth:** supplied `brand-assets/hero-banner.png`, `logo-header-wide.png`, and `favicon-1024.png`; existing rendered app baseline in `docs/brand-review/phase0.png`; the approved placement/palette requirements in BRAND-UPDATE.md. The user explicitly authorized SVG reconstruction and the login hero. Comparisons assess preservation of the working interface plus these intentional changes, rather than treating the old placeholder artwork as the target.

**Rendered implementation:** production Vite output served by the existing Node server on local port 3140 with isolated seeded data. Full-view comparisons: `docs/brand-review/phase1.png` through `phase5.png`. Final readable views: `docs/brand-review/login-desktop.png`, `login-phone.png`, and `standalone-error-phone.png`. Individual route/state captures and browser scripts remain in `/tmp/bphs-brand-review/`.

**Viewport/density:** desktop 1440×1000, tablet 834×1112, phone 390×844, narrow phone 320×740; DPR 1, light theme, self-hosted Geist loaded before capture. Full-page screenshots can extend below the CSS viewport for long records; comparisons pair the same route, content, viewport, and auth state. Seed data, last-login events, and relative timestamps differ slightly across runs; these are not design findings.

**Focused comparison:** `docs/brand-review/phase4-details.png` puts source and rendered artwork in the same comparison input. Original hero: 1916×821; same left crop scaled to 688×512 beside the browser's actual 688×512 hero element. Original signature: 2172×724; source crop x=76, y=66, width=2004, height=590, normalized to 260×77 beside the rendered 260×77 signature. No device frame or density mismatch. The cream/cool neutral backgrounds intentionally differ. `artwork.png` checks vector edges on light/dark grounds; `icons.png` checks 16/32px icons and the 180px touch icon. Phone captures were also opened at readable size to judge fields and drawer clearance.

**Findings and comparison history**

- Phase 0: baseline drawer capture initially caught its entry animation. Waited for it to settle and recaptured before judging; the final baseline shows the opaque drawer and clear close control.
- Phases 1–3: no actionable visual mismatches. Shared identity is consistent; SVG cleanup and navy replacement are intentional. Full boards preserve the app's layout, type, spacing, reading surfaces, and status meanings. Focused field/error/danger reviews are recorded in `contrast.json` and `login-errors.png`.
- Phase 4 [P2, fixed]: initial 1440px hero export softened lighthouse rays compared with the source. Evidence: `phase4-details-before.png`. Re-exported at original 1916×821 resolution, WebP quality 0.94 (57,502 bytes), rebuilt, recaptured the same viewports, and compared again in `phase4-details.png`. The final image preserves crisp rays, path edges, and the original texture; no actionable softness remains at the actual display size.
- Phase 4 [P2, fixed]: the existing standalone error's Try again reset the boundary without retrying a failed route load. Extracted `StandaloneError` and invalidated the router on retry. Repeated a synthetic auth-load failure, restored the endpoint, and verified retry returns to sign-in and sign-in returns to the originally requested route. Evidence: `extra-checks.json`; the initial error and post-fix rendered error use the same visual treatment.

**Required fidelity surfaces**

- Fonts/typography: app Geist/Geist Mono, weights, sizes, wrapping, and hierarchy stay intact. Corporate lettering is traced SVG paths from the supplied signature, with no replacement font. BPHS-Connect remains live readable app text. Auth and error headings remain more prominent than the small app label.
- Spacing/layout: rail width, top bar, drawer controls, form width/padding, table density, radii, and neutral shadows are preserved. The larger authentication identity is intentional. Desktop sign-in adds a balanced left illustration, with the 416px form in the right column. Tablet/phone omit that column; password change stays centered. No horizontal page overflow at tested widths.
- Colors/tokens: navy action/hover/tints match the approved proposal and all documentation representations. Neutral/status tokens are unchanged. Rendered text/focus pairs pass the recorded contrast measurements; white primary 12.43:1, white hover 14.76:1, navy/soft 10.96:1, focused navy border/white 12.43:1, danger 7.47:1. Decorative tints are not used as the sole focus boundary. Orange is confined to artwork.
- Image quality: supplied hero composition and texture retained; final export passes the direct normalized comparison. SVG cleanup removes fringe/stray pixels and deliberately flattens gradients to navy/orange. Simplified browser icon differs intentionally for small-size legibility. Dimensions are reserved, lettering is not stretched, and artwork remains self-hosted. All referenced build files return correct image MIME types and byte-identical content. No missing-image HTML fallback was accepted.
- Copy/content: constant BPHS-Connect in sign-in, both workspaces, mobile identity, password change, session prompt, and title suffixes; Brightpath Human Services is the corporate image name. Error/session instructions and operational terminology retain their meaning. The hero is decorative and contributes no duplicate announcement.

**Interactions/accessibility**

Sign-in succeeds, forced/voluntary password screens render, navigation works across breakpoints, standalone missing-page return honors the remembered workspace, and standalone retry now reloads. The session prompt initially focuses Password, traps keyboard focus, resists Escape, and successfully resumes the same record. Corporate image alt text is Brightpath Human Services; adjacent lighthouse and hero have empty alt. Browser review found no unexpected page errors, broken images, outbound font/image requests, or overflow. Synthetic error responses used for retry verification are expected.

**Implementation checklist**

- [x] Compare every implementation phase visually before committing it.
- [x] Normalize source/rendered imagery and fix the hero sharpness finding.
- [x] Verify rendered palette, responsive behavior, accessible identity, and session focus.
- [x] Verify production asset MIME types, bytes, and signed-out nested-route reload.
- [x] Build the unchanged Dockerfile and verify a healthy runtime image, signed-out media bytes/MIME types, and nested-route/reload shell delivery (docker-runtime.json).
- [x] Verify native hover with a headed desktop pointer, without injected styles/media overrides, and refresh a versioned favicon while the old unversioned icon remains cached (desktop-runtime.json and desktop-hover.png).
- VPS deployment and live-domain verification: explicitly outside this task, deferred to separate operational work per the user’s clarification.

Final project checks pass: client/server typecheck, production build, and 176 tests across 10 files (full test suite rerun outside the sandbox after two CLI-output failures in the restricted run). Final media-report.json verifies eight image files, versioned icons, PNG sizes, and no CSP events/errors on signed-out nested-route reload. No actionable P0/P1/P2 visual finding remains in the local build. Deployment is outside the clarified task scope; no required brand-update check remains open.

**Runtime follow-up:** built revision 9ff3e69 using the unchanged Dockerfile and Bun 1.3.14. The actual non-root Node v24.21.0 Linux container was healthy and served eight byte-identical images plus the correct nested-route SPA shell. The headed Chromium/WSLg screenshot was opened and judged at 1440×1000/DPR 1; the real CSS hover produces #062B3E and the old placeholder cache does not replace the new versioned icon. Disposable review container/volume removed; image retained. No app source changed.

**Historical public-domain probe (outside the brand-update scope):** both names currently resolve to 204.11.56.246 in this environment, differing from the guide's VPS at 50.6.205.113. Initial HTTPS probes rejected a testexp hostname mismatch; later probes timed out. See release-probe.json. A future deployment should confirm its target and DNS/TLS setup. The user clarified that this work is a brand update only; these probe results do not block completion.

# My Space end-to-end check (2026-10-19)

Result: passed, 33 of 33. This is the check for slice 2.2 of [MySpace-plan.md](MySpace-plan.md).

**Setup:** a production build (`bun run build`) served by the Node server (`SERVE_WEB=true`) with isolated seeded data. Headless Firefox driven by puppeteer-core, at 1366×860 (wide) and 390×844 (narrow, drawer). All accounts use the seed password.

**Accounts:**
- Super Admin (the first account, with no employee). Maintenance was the last workspace used.
- Assets-only, at Edit, linked to E-1201.
- Maintenance-only, at Edit, linked to E-1288, an archived employee.

**Each account, wide:**
- **My Space** is the first item in the account menu and opens `/me/profile`.
- The sidebar shows **Back to *last workspace*** in place of the switcher: Maintenance, Assets and Maintenance respectively.
- Mailbox and Personal Dashboard are `role="link"` with `aria-disabled="true"`, tabIndex −1 and no href. "Coming later" is part of their name.
- Clicking either placeholder leaves the page where it is.
- The Profile page shows the linked employee:
  - "None. The first account needs no employee." for the Super Admin.
  - "Tomas Berger E-1201" for Assets-only.
  - "Alice Nkemdirim E-1288 archived" for Maintenance-only. It loads because `GET /api/employees` is open to every account.
- A reload stays on `/me/profile` with the My Space sidebar.
- The Back link returns to that workspace's home, and that workspace is still the one remembered (`bphs.workspace`).

**Each account, narrow:**
- My Space from the account menu inside the drawer opens the page and closes the drawer.
- The drawer shows the Back link and both placeholders. Tapping a placeholder does nothing and the drawer stays open.
- The drawer's Back link navigates and closes the drawer.

**Also checked (Phase 1 check):**
- The Super Admin's tab order from the top runs Skip to content → Back to Maintenance → Profile → account menu → Change password, so the placeholders are never focused.
- An account that must change its password is still sent to `/password-change` from `/me/profile`.
- Signed out, `/me/profile` goes to `/login?redirect=%2Fme%2Fprofile`.

**Fixed during the build:**
- [P1] The Profile page first read the linked employee from `/api/lookups`, which needs Assets read, so a Maintenance-only account saw "…" for ever. It now uses `employeesQuery`.
- [P2] "Personal Dashboard" wrapped beside its "Coming later" hint in the 15.5rem rail. The hint now sits under the name.

**Screenshots** (local, gitignored): `qa-shots/myspace/e2e-{super,assets,maint}-{wide,drawer}.png`.

**Not covered:**
- A real screen reader. The name was checked from the DOM.
- An account with no workspace at all. The app already assumes every account has one.
