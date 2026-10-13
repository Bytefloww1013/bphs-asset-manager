import { z } from 'zod'

// Zod's JIT compiler probes for eval, which the app's strict Content-Security-Policy (rightly) forbids. The probe runs as each
// schema is built, so this module is imported before anything that defines one.
z.config({ jitless: true })
