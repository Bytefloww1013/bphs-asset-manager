---
description: Clocks, randomness and date formatting so seeds, tests and baselines come out the same every run
scope: root
covers: [dates, time, seed, SeedKit, determinism, clock, fixed-clock, FIXED_NOW, random, sqlite, baselines, browser-checks, remember-me, iso, daysBetween, formatUsDate, formatting, tests]
---

# Time and determinism

## Seeds

- Take the time from `kit.now` and randomness from the kit (`kit.rand`, `kit.int`, `kit.pick`, `kit.daysAgo`; `kit.deviceRand`/`kit.devicePick` for physical assets' device fields); never `Date.now()`, `new Date()` or `Math.random()` in seed code.
- Load seed code only when seeding: `seed: async (db, kit) => ...(await import('./seed.ts'))...`.

## Fixed clock

- Scratch servers and baseline scripts run under `docs/verify/fixed-clock.mjs` (`node --import ./docs/verify/fixed-clock.mjs`, with `FIXED_NOW` set to an ISO instant). Code that reads `new Date()` or `Date.now()` sees that instant.
- SQLite's own clock (`unixepoch()` column defaults) is not fixed; baseline scripts normalize those values. Don't add a column whose value a baseline compares if it comes from SQLite's clock.
- In browser checks sign in without "remember me": that cookie's expiry would be in the browser's past.

## Dates in code

- Store instants as `Date` (Drizzle timestamp columns); serialize them for the API with `iso()` (`server/lib/time.ts`).
- Shared date helpers live in `shared/dates.ts`; show dates the US way (`10/15/2026`, `12:40 PM`) with `formatUsDate`, and add any new format there with a test in `shared/dates.test.ts`.
- Day counts use `daysBetween` from `server/lib/time.ts`, not hand-rolled millisecond maths.
