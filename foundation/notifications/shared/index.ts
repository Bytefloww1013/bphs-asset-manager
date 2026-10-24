// The notifications module's public API, shared side: what other modules and the kernel may import from it.
export { canSendNotices, NOTICE_BODY_MAX, NOTICE_TITLE_MAX, NOTIFICATION_VIEWS } from './constants.ts'
export type { NotificationView } from './constants.ts'
export { noticeSchema, notificationListSchema } from './schemas.ts'
export type { NoticeInput, NotificationListInput } from './schemas.ts'
export type { NoticeRow, NoticeText, NotificationPage, NotificationRow } from './types.ts'
