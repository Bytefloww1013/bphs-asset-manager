import type { Grantee } from '#shared/permissions.ts'

/** The Inbox's views. */
export const NOTIFICATION_VIEWS = ['unread', 'all', 'archived'] as const
export type NotificationView = (typeof NOTIFICATION_VIEWS)[number]

/** A notice is plain text with line breaks: short enough to read in the bell's popover. */
export const NOTICE_TITLE_MAX = 120
export const NOTICE_BODY_MAX = 2000

/** Who may send notices. One rule, so widening it later is this line and its test. */
export const canSendNotices = (user: Grantee | undefined | null) => user?.superAdmin === true
