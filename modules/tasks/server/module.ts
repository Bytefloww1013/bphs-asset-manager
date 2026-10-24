import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { myTaskRoutes, taskRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { runTaskClock } from './service.ts'

/** Employee Tasks: the assigners' API, each account's own `/me/tasks`, and the clock that sends and reminds. */
export default defineServerModule({
  manifest,
  schema,
  routes: [
    { base: '/tasks', create: taskRoutes },
    { base: '/me/tasks', create: myTaskRoutes },
  ],
  seed: async (db, kit) => `${(await import('./seed.ts')).seedTasks(db, kit.now, kit)} tasks`,
  jobs: [
    // Scheduled arrivals and past-due reminders. It marks what it sends, so a missed or repeated tick is harmless.
    { name: 'tasks.clock', every: 60_000, run: runTaskClock },
  ],
})
