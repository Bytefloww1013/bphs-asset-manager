// The notifications module's public API, server side: what other modules and the kernel may import from it.
export { notices, notifications } from './schema.ts'
export {
  accountOf,
  forgetEmployeeNotifications,
  forgetNotifications,
  notify,
  purgeNotifications,
  relinkNotifications,
  sectionTeam,
} from './service.ts'
export type { NewNotification } from './service.ts'
