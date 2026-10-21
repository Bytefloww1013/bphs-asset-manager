import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { formatUsDate } from '../shared/dates.ts'
import {
  reviewCapCode,
  reviewCapStatusLabel,
  reviewEntryCode,
  reviewStatusLabel,
  type ReviewCapStatus,
  type ReviewStatus,
} from '../shared/constants.ts'
import { localToday } from '../shared/schemas.ts'
import type { Db } from './db/client.ts'
import { employees, reviewAttachments, reviewCaps, reviews } from './db/schema.ts'
import type { Actor } from './lib/audit.ts'
import { writeReviewAudit } from './lib/review-audit.ts'
import { plainToRichText, requireRichText } from './lib/richtext.ts'
import type { Upload } from './lib/uploads.ts'
import { saveReviewAttachments } from './services/review-attachments.ts'
import { appendReviewEntry, nextReviewCode, REVIEW_CREATED } from './services/reviews.ts'
import { fullName } from './services/refs.ts'

// Demo reviews for `bun run db:seed`, written as the services write them but at chosen times in the past, as the demo grievances
// are: the history and the Review Audit Log are append-only. It lives here, not in seed.ts, because only review code may write
// the Review Audit Log.

type Person = typeof employees.$inferSelect
interface Review {
  id: number
  code: string
  title: string
  status: ReviewStatus
}
interface Cap {
  id: number
  seq: number
  title: string
  status: ReviewCapStatus
  version: number
}

const DAY = 86_400_000

const textFile = (filename: string, text: string): Upload => {
  const bytes = Buffer.from(text)
  return { filename, contentType: 'text/plain', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * Write the demo reviews. `person` finds an employee by code; Priya is a Super Admin, Marcus has Edit and Rosa Read Only, so
 * Rosa works on the review she is the reviewer of. AR-2026-0003 is about Marcus, so his account never sees it.
 */
export function seedReviews(
  db: Db,
  now: number,
  person: (code: string) => Person,
  { priya, marcus, rosa }: { priya: Actor; marcus: Actor; rosa: Actor },
): number {
  /** `days` ago (negative: ahead), at `hour` o'clock local time. */
  const at = (days: number, hour = 10, minute = 0) => {
    const date = new Date(now - days * DAY)
    date.setHours(hour, minute, 0, 0)
    return date
  }
  const day = (days: number) => localToday(at(days))

  return db.transaction((tx) => {
    let count = 0

    const create = (
      actor: Actor,
      when: Date,
      r: {
        title: string
        summary: string
        findings: string
        body?: string
        reviewDaysAgo: number
        employee: string
        reviewer: string
      },
    ): Review => {
      const { code, year, seq } = nextReviewCode(tx, when)
      const body = requireRichText(r.body ?? '', 'body', { optional: true })
      const { id } = tx
        .insert(reviews)
        .values({
          code,
          year,
          seq,
          title: r.title,
          summary: r.summary,
          findings: r.findings,
          bodyHtml: body.html,
          bodyText: body.text,
          reviewDate: day(r.reviewDaysAgo),
          employeeId: person(r.employee).id,
          reviewerId: person(r.reviewer).id,
          createdByUserId: actor.id,
          createdAt: when,
          lastActivityAt: when,
        })
        .returning({ id: reviews.id })
        .get()
      appendReviewEntry(tx, actor, id, { kind: 'system', occurredAt: when, title: REVIEW_CREATED, at: when })
      writeReviewAudit(tx, actor, {
        action: 'create',
        entityType: 'review',
        entityId: id,
        reviewId: id,
        details: `${code} · ${r.title}`,
        at: when,
      })
      count++
      return { id, code, title: r.title, status: 'open' }
    }

    /** A status change or a void, with its automatic entry, as `applyStatus` makes it. */
    const status = (r: Review, actor: Actor, when: Date, to: ReviewStatus, note: string) => {
      tx.update(reviews)
        .set({ status: to, completedAt: to === 'completed' ? when : null })
        .where(eq(reviews.id, r.id))
        .run()
      const summary = `Status: ${reviewStatusLabel(r.status)} → ${reviewStatusLabel(to)}`
      appendReviewEntry(tx, actor, r.id, {
        kind: 'system',
        occurredAt: when,
        title: summary,
        body: plainToRichText(note),
        at: when,
      })
      writeReviewAudit(tx, actor, {
        action: to === 'voided' ? 'void' : 'status',
        entityType: 'review',
        entityId: r.id,
        reviewId: r.id,
        details: `${r.code} · ${r.title} · ${summary}`,
        at: when,
      })
      r.status = to
    }

    /** A CAP, as Not started, as `createReviewCap` adds it. */
    const cap = (
      r: Review,
      actor: Actor,
      when: Date,
      c: { title: string; shortDescription: string; body?: string; responsible: string; dueDaysAgo?: number },
    ): Cap => {
      const body = requireRichText(c.body ?? '', 'body', { optional: true })
      const responsible = person(c.responsible)
      const dueDate = c.dueDaysAgo === undefined ? null : day(c.dueDaysAgo)
      const seq =
        tx.select({ id: reviewCaps.id }).from(reviewCaps).where(eq(reviewCaps.reviewId, r.id)).all().length + 1
      const { id } = tx
        .insert(reviewCaps)
        .values({
          reviewId: r.id,
          seq,
          title: c.title,
          shortDescription: c.shortDescription,
          bodyHtml: body.html,
          bodyText: body.text,
          responsibleEmployeeId: responsible.id,
          dueDate,
          createdByUserId: actor.id,
          createdAt: when,
          updatedAt: when,
        })
        .returning({ id: reviewCaps.id })
        .get()
      const label = reviewCapCode(seq)
      const due = dueDate ? ` Due: ${formatUsDate(dueDate)}.` : ''
      appendReviewEntry(tx, actor, r.id, {
        kind: 'system',
        capId: id,
        occurredAt: when,
        title: `${label} added: ${c.title}. Responsible: ${fullName(responsible.firstName, responsible.lastName)}.${due}`,
        at: when,
      })
      writeReviewAudit(tx, actor, {
        action: 'create',
        entityType: 'cap',
        entityId: id,
        reviewId: r.id,
        details: `${r.code} ${label} · ${c.title}`,
        at: when,
      })
      return { id, seq, title: c.title, status: 'not_started', version: 1 }
    }

    /** A CAP's status change, with its note and any files, as `changeReviewCapStatus` makes it. */
    const capStatus = (
      r: Review,
      c: Cap,
      actor: Actor,
      when: Date,
      to: ReviewCapStatus,
      note: string,
      files: Upload[] = [],
    ) => {
      const completed = to === 'completed'
      c.version++
      tx.update(reviewCaps)
        .set({
          status: to,
          version: c.version,
          updatedAt: when,
          completedAt: completed ? when : null,
          completedByUserId: completed ? actor.id : null,
          completedByLabel: completed ? actor.name : null,
        })
        .where(eq(reviewCaps.id, c.id))
        .run()
      const label = reviewCapCode(c.seq)
      const summary = `${label}: ${reviewCapStatusLabel(c.status)} → ${reviewCapStatusLabel(to)}`
      appendReviewEntry(tx, actor, r.id, {
        kind: 'system',
        capId: c.id,
        occurredAt: when,
        title: summary,
        body: plainToRichText(note),
        at: when,
      })
      writeReviewAudit(tx, actor, {
        action: 'status',
        entityType: 'cap',
        entityId: c.id,
        reviewId: r.id,
        details: `${r.code} ${label} · ${c.title} · ${summary}`,
        at: when,
      })
      saveReviewAttachments(tx, actor, r, c, files, when)
      c.status = to
    }

    /** An update or a correction, as someone typed it, filed on the review or on a CAP. A correction happens when it is written. */
    const entry = (
      r: Review,
      actor: Actor,
      when: Date,
      e: {
        kind: 'update' | 'correction'
        cap?: Cap
        corrects?: { id: number }
        occurredAt?: Date
        title: string
        shortDescription?: string
        body?: string
        files?: Upload[]
      },
    ) => {
      const row = appendReviewEntry(tx, actor, r.id, {
        kind: e.kind,
        capId: e.cap?.id,
        correctsEntryId: e.corrects?.id,
        occurredAt: e.occurredAt ?? when,
        title: e.title,
        shortDescription: e.shortDescription,
        body: e.body ? requireRichText(e.body, 'body') : undefined,
        at: when,
      })
      writeReviewAudit(tx, actor, {
        action: 'entry',
        entityType: 'entry',
        entityId: row.id,
        reviewId: r.id,
        details: `${r.code} ${reviewEntryCode(row.seq)} · ${e.title}`,
        at: when,
      })
      const files = saveReviewAttachments(tx, actor, r, e.cap ?? null, e.files ?? [], when)
      return { id: row.id, files }
    }

    const withdraw = (
      r: Review,
      actor: Actor,
      when: Date,
      c: Cap | null,
      file: { id: number; filename: string },
      reason: string,
    ) => {
      tx.update(reviewAttachments)
        .set({ withdrawnAt: when, withdrawnReason: reason })
        .where(eq(reviewAttachments.id, file.id))
        .run()
      const title = c ? `${reviewCapCode(c.seq)}: File withdrawn` : 'File withdrawn'
      appendReviewEntry(tx, actor, r.id, {
        kind: 'system',
        capId: c?.id,
        occurredAt: when,
        title,
        shortDescription: file.filename,
        body: plainToRichText(reason),
        at: when,
      })
      const where = c ? `${r.code} ${reviewCapCode(c.seq)}` : r.code
      writeReviewAudit(tx, actor, {
        action: 'withdraw',
        entityType: 'attachment',
        entityId: file.id,
        reviewId: r.id,
        details: `${where} · ${file.filename}`,
        at: when,
      })
    }

    // Created oldest first, so their numbers follow the order they were entered in.

    // Completed: every CAP done or cancelled, with a corrected update and files on a CAP.
    const pettyCash = create(priya, at(85, 9, 30), {
      title: 'Petty cash handling at Harbour House',
      summary: 'Quarterly cash review found the float short twice and receipts missing for most of June.',
      findings:
        'The float was $46 short on 12 June and $18 short on 27 June.\nReceipts were on file for 9 of 31 June withdrawals.\nOnly the House Manager counts the float, and no count is signed.',
      body: '<p>Finance carried out its quarterly review of the Harbour House float on 3 July with Mina present.</p><p>Nothing suggests money was taken: the shortfalls match two grocery runs paid for in cash with no receipt kept.</p>',
      reviewDaysAgo: 86,
      employee: 'E-1296',
      reviewer: 'E-0988',
    })
    status(pettyCash, marcus, at(84, 11), 'in_progress', 'Talked the findings through with Mina. CAPs agreed.')
    const count2 = cap(pettyCash, marcus, at(84, 11, 20), {
      title: 'Count the float weekly, signed by two staff',
      shortDescription: 'A second staff member counts with Mina every Friday and both sign the log.',
      responsible: 'E-1296',
      dueDaysAgo: 70,
    })
    const receipts = cap(pettyCash, marcus, at(84, 11, 30), {
      title: 'Send receipts to Finance each Friday',
      shortDescription: 'Scan every receipt and email the week’s scans to Finance with the count.',
      body: '<p>Withdrawals with no receipt need a note from whoever spent the money, saying what it was for.</p>',
      responsible: 'E-1296',
      dueDaysAgo: 70,
    })
    const safe = cap(pettyCash, marcus, at(84, 11, 40), {
      title: 'Move the float to a locked safe',
      shortDescription: 'Fit a small safe in the house office.',
      responsible: 'E-0761',
      dueDaysAgo: 60,
    })
    capStatus(
      pettyCash,
      safe,
      marcus,
      at(83, 15),
      'cancelled',
      'Grant says a safe was fitted in the office in May. The float is already in it.',
    )
    capStatus(pettyCash, count2, marcus, at(80, 9), 'in_progress', 'First two-person count done on Friday.')
    const spot = entry(pettyCash, marcus, at(76, 16), {
      kind: 'update',
      cap: count2,
      occurredAt: at(76, 14),
      title: 'Spot count matched the log',
      shortDescription: 'Unannounced count on Wednesday: $200.00, as the log said.',
      files: [
        textFile(
          'spot-count.txt',
          'Harbour House float, unannounced count\nCounted: $200.00\nLog: $200.00\nCounted by M. Oyelaran and M. Haddad\n',
        ),
      ],
    })
    entry(pettyCash, marcus, at(75, 9, 15), {
      kind: 'correction',
      corrects: spot,
      title: 'Spot count was on Tuesday, not Wednesday',
      body: '<p>The count was done on Tuesday afternoon. The figures are right.</p>',
    })
    capStatus(pettyCash, receipts, marcus, at(70, 10), 'completed', 'Four Fridays in a row with every receipt sent.', [
      textFile('receipts-august.txt', 'August: 27 withdrawals, 27 receipts or notes received.\n'),
    ])
    capStatus(pettyCash, count2, marcus, at(70, 10, 10), 'completed', 'Four signed weekly counts, all balanced.')
    status(
      pettyCash,
      marcus,
      at(68, 14),
      'completed',
      'All CAPs done. The next quarterly review will check the counts are still signed.',
    )

    // In progress, worked on by its reviewer, Rosa, who has Read Only: one CAP done, one overdue, two to start; a file withdrawn.
    const backlog = create(marcus, at(40, 13, 10), {
      title: 'Intake referral backlog',
      summary: 'Referrals waited up to 19 days for a first call; the target is 5.',
      findings:
        'In August, 41 of 112 referrals waited more than 5 working days for a first call.\nThe referral inbox is checked by one person, with no cover when they are away.\nThere is no list of referrals waiting.',
      body: '<p>Jules has run the referral inbox alone since March. The longest waits were in the two weeks Jules was on leave.</p>',
      reviewDaysAgo: 41,
      employee: 'E-1304',
      reviewer: 'E-1102',
    })
    status(backlog, rosa, at(39, 9), 'in_progress', 'Met Jules and Sasha. CAPs to follow.')
    const cover = cap(backlog, rosa, at(39, 9, 30), {
      title: 'Name cover for the referral inbox',
      shortDescription: 'Someone checks the inbox every working day Jules is away.',
      responsible: 'E-1315',
      dueDaysAgo: 30,
    })
    const waiting = cap(backlog, rosa, at(39, 9, 40), {
      title: 'Keep a list of referrals waiting',
      shortDescription: 'A shared list of each referral, the day it came in and the day of the first call.',
      body: '<p>Columns: date received, referrer, first call date, called by. Reviewed in the Monday team meeting.</p>',
      responsible: 'E-1304',
      dueDaysAgo: 5,
    })
    cap(backlog, rosa, at(39, 9, 50), {
      title: 'Report waits to the Program Director monthly',
      shortDescription: 'The number of referrals waiting more than 5 working days, each month.',
      responsible: 'E-1315',
      dueDaysAgo: -14,
    })
    capStatus(
      backlog,
      cover,
      rosa,
      at(31, 11),
      'completed',
      'Sasha covers the inbox from now on. It was covered all through Jules’s leave last week.',
    )
    capStatus(backlog, waiting, rosa, at(28, 10), 'in_progress', 'Jules has started the list.')
    cap(backlog, rosa, at(20, 15), {
      title: 'Ask referrers what they need from the first call',
      shortDescription: 'A short survey of the five busiest referrers.',
      responsible: 'E-1304',
    })
    const listed = entry(backlog, rosa, at(18, 16), {
      kind: 'update',
      cap: waiting,
      occurredAt: at(18, 15),
      title: 'List started, not yet reviewed in the team meeting',
      shortDescription: 'The list holds 23 referrals so far.',
      files: [
        textFile(
          'referrals-waiting.txt',
          'Received\tReferrer\tFirst call\n09-02\tCounty CMH\t09-04\n09-03\tSt. Anne’s\t\n',
        ),
        textFile('rota-notes.txt', 'Notes on the Intake rota. Not about this review.\n'),
      ],
    })
    withdraw(backlog, priya, at(17, 9), waiting, listed.files[1]!, 'Attached to the wrong review by mistake.')
    entry(backlog, rosa, at(10, 14), {
      kind: 'update',
      occurredAt: at(10, 11),
      title: 'Waits down to 6 days on average',
      shortDescription: 'September so far, from the list.',
    })

    // Open, about Marcus, so his account never sees it, though he has Edit.
    const approvals = create(priya, at(6, 15, 30), {
      title: 'Purchase approvals over the Controller’s limit',
      summary: 'Three purchase orders over $5,000 were approved by the Controller alone.',
      findings:
        'POs 2231, 2240 and 2262 were over the $5,000 limit and carry one approval.\nThe second approver field was left empty each time.',
      reviewDaysAgo: 6,
      employee: 'E-0988',
      reviewer: 'E-1288',
    })
    cap(approvals, priya, at(6, 16), {
      title: 'Second approval on every PO over $5,000',
      shortDescription: 'The purchasing system refuses a PO over the limit with one approval.',
      responsible: 'E-0904',
      dueDaysAgo: -21,
    })

    // Voided: entered twice by mistake.
    const twice = create(marcus, at(3, 10), {
      title: 'Referral backlog, Intake',
      summary: 'Referrals wait too long for a first call.',
      findings: 'Up to 19 days in August.',
      reviewDaysAgo: 41,
      employee: 'E-1304',
      reviewer: 'E-1102',
    })
    status(twice, priya, at(3, 10, 20), 'voided', `Entered twice. This review is recorded as ${backlog.code}.`)

    // Open, just recorded, with no CAPs yet.
    create(marcus, at(1, 11, 45), {
      title: 'Medication log gaps on night shifts',
      summary: 'The night medication log at Harbour House has five unsigned doses this month.',
      findings:
        'Five doses in October have no initials, all on nights Callum worked.\nThe doses were given: the residents’ charts and the blister packs agree.',
      reviewDaysAgo: 1,
      employee: 'E-1356',
      reviewer: 'E-1296',
    })

    return count
  })
}
