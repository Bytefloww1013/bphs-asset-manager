import { z } from 'zod'
import { id, requiredText } from '#shared/schemas.ts'
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, NOTIFICATION_VIEWS } from './constants.ts'

export const notificationListSchema = z.object({
  view: z.enum(NOTIFICATION_VIEWS).default('all'),
  /** The cursor: only notifications older than this id. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
})
export type NotificationListInput = z.infer<typeof notificationListSchema>

/** A Super Admin's notice, to every active account or to the accounts picked. */
export const noticeSchema = z.object({
  title: requiredText(NOTICE_TITLE_MAX, 'Title'),
  body: requiredText(NOTICE_BODY_MAX, 'Message'),
  audience: z.union([
    z.literal('all'),
    z.object({ userIds: z.array(id).min(1, 'Pick at least one account').max(1000) }),
  ]),
})
export type NoticeInput = z.infer<typeof noticeSchema>
