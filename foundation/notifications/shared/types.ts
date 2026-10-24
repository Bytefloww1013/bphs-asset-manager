import type { NotificationKind } from '#shared/registry.ts'

export interface NotificationRow {
  id: number
  kind: NotificationKind
  title: string
  body: string | null
  /** An in-app path. */
  link: string
  createdAt: string
  readAt: string | null
  archivedAt: string | null
}

export interface NotificationPage {
  items: NotificationRow[]
  /** Pass as `before` for the next page; null on the last one. */
  nextCursor: number | null
}

/** A sent notice, as the Notices page lists it. */
export interface NoticeRow {
  id: number
  title: string
  body: string
  audience: 'all' | 'picked'
  sentBy: string
  createdAt: string
  /** The accounts it went to, and how many of them have read it. */
  recipients: number
  read: number
}

/** A notice as a recipient reads it: who sent it and when, never who else got it. */
export type NoticeText = Pick<NoticeRow, 'id' | 'title' | 'body' | 'sentBy' | 'createdAt'>
