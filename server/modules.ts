// The module contract, server side (issue #23): what `<tier>/<name>/server/module.ts` gives the kernel.
// The kernel reads it through `server/registry.ts`. This file never imports the registry, so a module can import it without a cycle.
import type { CustodyKind } from '#foundation/assignments/server/index.ts'
import type { EmployeeReferences, employees } from '#foundation/employees/server/index.ts'
import type { ProgramReferences, programs } from '#foundation/programs/server/index.ts'
import type { Hono } from 'hono'
import type { ZodType } from 'zod'
import type { Section } from '../shared/constants.ts'
import type { Importer } from '../shared/importers.ts'
import type { SharedManifest } from '../shared/modules.ts'
import type { AppOptions } from './app.ts'
import type { Db, DbLike } from './db/client.ts'
import type { users } from './db/schema.ts'
import type { Env } from './http.ts'
import type { Actor } from './lib/actor.ts'

/** An API router, mounted under `/api<base>` behind the session check. Base `''` mounts it at `/api` itself (reports). */
export interface ModuleRoute {
  base: string
  create(db: Db, options: AppOptions): Hono<Env>
}

/** A public router under `/api/webhooks<base>`, with no session: it checks its own secret. */
export interface ModuleWebhook {
  base: string
  create(db: Db, options: AppOptions): Hono
}

/** Work on a timer. Each run is on its own: one that throws is logged, and stops neither the others nor the server. */
export interface Job {
  name: string
  /** Milliseconds between runs. */
  every: number
  /** Also run once as the server starts. */
  atStart?: boolean
  run(db: Db): unknown
}

/** Why a record can't be deleted, archived or deactivated now. */
export interface Blocker {
  code: string
  reason: string
}

/**
 * A list on the Lookup lists page (asset types, brands, …). The kernel mounts its routes under `/api/<path>`: Read lists it,
 * Edit adds and changes it, and deleting also needs Full. Its own service keeps the rules (names unique, one left active).
 */
export interface LookupList<Create = unknown, Update = unknown> {
  /** Its address under `/api`, as `asset-types`. */
  path: string
  resource: Section
  list(db: Db): unknown
  createSchema: ZodType<Create>
  create(db: Db, actor: Actor, input: Create): unknown
  updateSchema: ZodType<Update>
  update(db: Db, actor: Actor, id: number, input: Update): unknown
  remove(db: Db, actor: Actor, id: number): void
}

/** A lookup list, with its inputs typed by its schemas. */
export const defineLookupList = <Create, Update>(list: LookupList<Create, Update>): LookupList<Create, Update> => list

/** A spreadsheet importer and how its rows are stored. */
export interface ImportStore {
  importer: Importer
  existingKeys(db: DbLike): string[]
  create(tx: DbLike, actor: Actor, record: Record<string, string>): void
}

/** One more picker for the forms' `/api/lookups` (the assets module's): its key, after the assets' own, and its active values. */
export interface LookupsPart {
  key: string
  load(db: DbLike): unknown
}

/** A report or dashboard figure. First shape: the Overview is the assets module's own page, so no module registers one yet. */
export interface Report {
  key: string
  label: string
  resource: string
}

/** The questions the kernel and foundation modules ask every module. Each module may give any number of answers to each. */
export interface ServerHooks {
  /** What this module has to do with employees: their row's figures, and what keeps them from being deleted or archived. */
  'employee.references': EmployeeReferences
  /** The same for a program: its row's figures, and what keeps it from being deleted or deactivated. */
  'program.references': ProgramReferences
  /** The kinds of item the custody ledger holds (`foundation/assignments`): each module whose items are issued registers its own. */
  'custody.kinds': CustodyKind
  lists: LookupList
  /** More pickers for `/api/lookups`, from the modules whose forms need them. */
  lookups: LookupsPart
  importers: ImportStore
  reports: Report
}

export type HookName = keyof ServerHooks

type SeedUser = typeof users.$inferSelect
type SeedEmployee = typeof employees.$inferSelect

/**
 * What `bun run db:seed` (`server/seed.ts`) gives each module's `seed`: one random sequence, a clock and an audit writer, shared
 * by every module in turn so the demo comes out the same each time, and the demo employees and accounts it made first.
 */
export interface SeedKit {
  now: number
  rand: () => number
  int: (min: number, max: number) => number
  pick: <T>(list: readonly T[]) => T
  /** A second sequence, for the physical assets' brands, models and Entra ObjectIds, added later than the rest. */
  deviceRand: () => number
  devicePick: <T>(list: readonly T[]) => T
  /** `n` days ago, give or take a few hours (from `rand`). */
  daysAgo: (n: number) => Date
  /** Writes an audit log row as `who`. */
  audit: (
    d: DbLike,
    at: Date,
    who: SeedUser,
    action: 'create' | 'issue' | 'return' | 'update',
    entityType: string,
    entityId: number,
    details: string,
  ) => unknown
  /** Every demo employee, and those not archived. */
  people: SeedEmployee[]
  active: SeedEmployee[]
  byCode: (code: string) => SeedEmployee
  /** Priya is a Super Admin, Marcus has Edit, Dana works in Grievances and Tasks, Rosa has Read Only. */
  priya: SeedUser
  marcus: SeedUser
  dana: SeedUser
  rosa: SeedUser
  /** The two who issue and return. */
  actors: SeedUser[]
  /**
   * The demo programs, with their audit rows. The first call makes them, in `d` (a transaction), drawing from `rand` where it
   * stands then; later calls return them. The assets call it after their fleet, so the fleet comes out as it always has.
   */
  programs: (d?: DbLike) => (typeof programs.$inferSelect)[]
}

export interface ServerModule {
  manifest: SharedManifest
  /** The module's tables (its `server/schema.ts`). drizzle-kit reads the files themselves (`drizzle.config.ts`). */
  schema?: Readonly<Record<string, unknown>>
  routes?: readonly ModuleRoute[]
  webhooks?: readonly ModuleWebhook[]
  jobs?: readonly Job[]
  /** Runs at every start, after the migrations, in dependency order: default rows and other upkeep. */
  startup?(db: Db): void | Promise<void>
  /** Demo data for `bun run db:seed`, in dependency order. Says what it added for the summary line, as `116 physical assets`. */
  seed?(db: Db, kit: SeedKit): string | Promise<string>
  hooks?: { readonly [K in HookName]?: readonly ServerHooks[K][] }
}

/** An entry may read the kernel and the modules its module depends on as it loads: the registry never imports the modules (the entry point installs them). */
export const defineServerModule = <const M extends ServerModule>(module: M): M => module
