// Test and scratch use only: a fixed clock for the seed and the scratch server, so two runs give the same data (issue #23, 0.2).
// Load it with `node --import ./docs/verify/fixed-clock.mjs ...`. Without FIXED_NOW (an ISO instant) it does nothing.
// The clock stays at FIXED_NOW: a ticking one would let the seed's `now` differ by the milliseconds it took to start.
// Timers still fire in real time. Sign in without "remember me" in browser checks: that cookie's Expires would be in the browser's past.
// SQLite's own clock (the `unixepoch()` column defaults) is not affected: the baseline scripts normalise those values.
const fixed = process.env.FIXED_NOW
if (fixed) {
  const RealDate = Date
  const target = RealDate.parse(fixed)
  if (Number.isNaN(target)) throw new Error(`FIXED_NOW must be an ISO instant, but it is "${fixed}".`)
  const now = () => target
  globalThis.Date = new Proxy(RealDate, {
    construct: (real, args, newTarget) => Reflect.construct(real, args.length ? args : [now()], newTarget),
    apply: () => new RealDate(now()).toString(),
    get: (real, key) => (key === 'now' ? now : Reflect.get(real, key)),
  })
}
