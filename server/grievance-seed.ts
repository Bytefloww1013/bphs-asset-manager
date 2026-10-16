import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { grievanceEntryCode, grievanceStatusLabel, type GrievanceAuditAction, type GrievanceStatus } from '../shared/constants.ts'
import { localToday } from '../shared/schemas.ts'
import type { Db } from './db/client.ts'
import { employees, grievanceAttachments, grievanceCategories, grievancePeople, grievances, grievanceVersions } from './db/schema.ts'
import type { Actor } from './lib/audit.ts'
import { writeGrievanceAudit } from './lib/grievance-audit.ts'
import { plainToRichText, requireRichText } from './lib/richtext.ts'
import type { Upload } from './lib/uploads.ts'
import { saveAttachments } from './services/grievance-attachments.ts'
import { appendGrievanceEntry, GRIEVANCE_RECORDED } from './services/grievance-entries.ts'
import { nextGrievanceCode } from './services/grievances.ts'
import { fullName } from './services/refs.ts'

// Demo grievances for `bun run db:seed`, written as the services write them but at chosen times in the past: the timeline and
// the Grievance Audit Log are append-only, so nothing can be back-dated after it is written. It lives here, not in seed.ts,
// because only grievance code may write the Grievance Audit Log.

type Person = typeof employees.$inferSelect
interface Case {
  id: number
  code: string
  title: string
  status: GrievanceStatus
  owner: string
}

const DAY = 86_400_000

const textFile = (filename: string, text: string): Upload => {
  const bytes = Buffer.from(text)
  return { filename, contentType: 'text/plain', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** Write the demo grievances. `person` finds an employee by code; Priya is a Super Admin and Marcus an Admin. */
export function seedGrievances(db: Db, now: number, person: (code: string) => Person, { priya, marcus }: { priya: Actor; marcus: Actor }): number {
  /** `days` ago, at `hour` o'clock local time. */
  const at = (days: number, hour = 10, minute = 0) => {
    const date = new Date(now - days * DAY)
    date.setHours(hour, minute, 0, 0)
    return date
  }
  const nameOf = (p: Person) => fullName(p.firstName, p.lastName)

  return db.transaction((tx) => {
    const categories = Object.fromEntries(tx.select().from(grievanceCategories).all().map((c) => [c.name, c.id])) as Record<string, number>
    let count = 0

    const create = (
      actor: Actor,
      when: Date,
      g: { title: string; shortDescription: string; body: string; madeDaysAgo: number; category: string; owner: string; employees: string[]; management: string[]; files?: Upload[] },
    ): Case => {
      const { code, year, seq } = nextGrievanceCode(tx, when)
      const body = requireRichText(g.body, 'body')
      const owner = person(g.owner)
      const { id } = tx
        .insert(grievances)
        .values({
          code,
          year,
          seq,
          title: g.title,
          shortDescription: g.shortDescription,
          bodyHtml: body.html,
          bodyText: body.text,
          dateMade: localToday(at(g.madeDaysAgo)),
          ownerId: owner.id,
          categoryId: categories[g.category]!,
          createdByUserId: actor.id,
          createdAt: when,
          lastActivityAt: when,
        })
        .returning({ id: grievances.id })
        .get()
      tx.insert(grievancePeople)
        .values([
          ...g.employees.map((c) => ({ grievanceId: id, employeeId: person(c).id, role: 'employee' as const })),
          ...g.management.map((c) => ({ grievanceId: id, employeeId: person(c).id, role: 'management' as const })),
        ])
        .run()
      appendGrievanceEntry(tx, actor, id, { kind: 'system', occurredAt: when, title: GRIEVANCE_RECORDED, at: when })
      writeGrievanceAudit(tx, actor, { action: 'create', entityType: 'grievance', entityId: id, details: `${code} · ${g.title}`, at: when })
      saveAttachments(tx, actor, { id, code }, null, g.files ?? [], when)
      count++
      return { id, code, title: g.title, status: 'open', owner: nameOf(owner) }
    }

    /** An action, event or correction, as someone typed it. A correction happens when it is written. */
    const entry = (
      g: Case,
      actor: Actor,
      when: Date,
      e: { kind: 'action' | 'event' | 'correction'; occurredAt?: Date; corrects?: { id: number }; title: string; shortDescription?: string; body?: string; files?: Upload[] },
    ) => {
      const row = appendGrievanceEntry(tx, actor, g.id, {
        kind: e.kind,
        correctsEntryId: e.corrects?.id,
        occurredAt: e.occurredAt ?? when,
        title: e.title,
        shortDescription: e.shortDescription,
        body: e.body ? requireRichText(e.body, 'body') : undefined,
        at: when,
      })
      writeGrievanceAudit(tx, actor, { action: 'entry', entityType: 'grievance_entry', entityId: row.id, details: `${g.code} ${grievanceEntryCode(row.seq)} · ${e.title}`, at: when })
      const files = saveAttachments(tx, actor, g, row, e.files ?? [], when)
      return { id: row.id, files }
    }

    /** A status, owner or void change, with its automatic entry, as `applyChange` makes it. */
    const change = (g: Case, actor: Actor, when: Date, action: GrievanceAuditAction, summary: string, note: string, set: Partial<typeof grievances.$inferInsert>) => {
      tx.update(grievances).set(set).where(eq(grievances.id, g.id)).run()
      appendGrievanceEntry(tx, actor, g.id, { kind: 'system', occurredAt: when, title: summary, body: plainToRichText(note), at: when })
      writeGrievanceAudit(tx, actor, { action, entityType: 'grievance', entityId: g.id, details: `${g.code} · ${g.title} · ${summary}`, at: when })
    }
    const status = (g: Case, actor: Actor, when: Date, to: GrievanceStatus, note: string) => {
      change(g, actor, when, to === 'voided' ? 'void' : 'status', `Status: ${grievanceStatusLabel(g.status)} → ${grievanceStatusLabel(to)}`, note, { status: to })
      g.status = to
    }
    const handOver = (g: Case, actor: Actor, when: Date, to: string, note: string) => {
      const next = person(to)
      change(g, actor, when, 'owner', `Owner: ${g.owner} → ${nameOf(next)}`, note, { ownerId: next.id })
      g.owner = nameOf(next)
    }

    /** An edit of the title and short description, keeping what they were as a version, as `updateGrievance` does. */
    const edit = (g: Case, actor: Actor, when: Date, to: { title: string; shortDescription: string }, reason: string) => {
      const was = tx.select().from(grievances).where(eq(grievances.id, g.id)).get()!
      const category = tx.select().from(grievanceCategories).where(eq(grievanceCategories.id, was.categoryId)).get()!
      const named = tx
        .select({ role: grievancePeople.role, code: employees.code, firstName: employees.firstName, lastName: employees.lastName })
        .from(grievancePeople)
        .innerJoin(employees, eq(employees.id, grievancePeople.employeeId))
        .where(eq(grievancePeople.grievanceId, g.id))
        .orderBy(grievancePeople.role)
        .all()
      tx.insert(grievanceVersions)
        .values({
          grievanceId: g.id,
          version: was.version,
          title: was.title,
          shortDescription: was.shortDescription,
          bodyHtml: was.bodyHtml,
          bodyText: was.bodyText,
          dateMade: was.dateMade,
          categoryName: category.name,
          people: named.map((p) => ({ role: p.role, code: p.code, name: fullName(p.firstName, p.lastName) })),
          changedByUserId: actor.id,
          changedByLabel: actor.name,
          changedAt: when,
          reason,
        })
        .run()
      tx.update(grievances).set({ ...to, version: was.version + 1 }).where(eq(grievances.id, g.id)).run()
      const summary = 'Edited: Title, Short description'
      appendGrievanceEntry(tx, actor, g.id, { kind: 'system', occurredAt: when, title: summary, body: plainToRichText(reason), at: when })
      writeGrievanceAudit(tx, actor, { action: 'update', entityType: 'grievance', entityId: g.id, details: `${g.code} · ${to.title} · ${summary}`, at: when })
      g.title = to.title
    }

    const withdraw = (g: Case, actor: Actor, when: Date, file: { id: number; filename: string }, reason: string) => {
      tx.update(grievanceAttachments).set({ withdrawnAt: when, withdrawnReason: reason }).where(eq(grievanceAttachments.id, file.id)).run()
      appendGrievanceEntry(tx, actor, g.id, { kind: 'system', occurredAt: when, title: 'File withdrawn', shortDescription: file.filename, body: plainToRichText(reason), at: when })
      writeGrievanceAudit(tx, actor, { action: 'withdraw', entityType: 'grievance_attachment', entityId: file.id, details: `${g.code} · ${file.filename}`, at: when })
    }

    // Created oldest first, so their numbers follow the order they were entered in.

    // Closed: worked through from start to finish.
    const overtime = create(priya, at(95, 9, 40), {
      title: 'Overtime not paid for July double shifts',
      shortDescription: 'Two support workers say the double shifts they covered in July are missing from their pay.',
      body:
        '<p>Tomas and Bilal each covered four double shifts at Harbour House in the first half of July while the house was short-staffed. ' +
        'Their pay for the period shows <strong>regular hours only</strong>.</p><ul><li>Tomas: 4 double shifts, 32 hours claimed</li><li>Bilal: 4 double shifts, 30 hours claimed</li></ul>',
      madeDaysAgo: 97,
      category: 'Pay and hours',
      owner: 'E-1042',
      employees: ['E-1201', 'E-1219'],
      management: ['E-1296'],
      files: [textFile('july-timesheet-summary.txt', 'Harbour House, 1-15 July\nT. Berger: 4 x double (32h)\nB. Osman: 4 x double (30h)\n')],
    })
    entry(overtime, priya, at(93, 14), { kind: 'action', occurredAt: at(93, 11), title: 'Met with Tomas and Bilal', shortDescription: 'Went through the shifts they covered, one by one.', body: '<p>Both brought their own notes of the dates. They agree with each other on every shift.</p>' })
    status(overtime, priya, at(93, 14, 20), 'in_progress', 'Taking this to Payroll.')
    entry(overtime, priya, at(88, 16), { kind: 'event', occurredAt: at(88, 15), title: 'Payroll confirmed the hours were missed', shortDescription: 'The rota change was never sent to Payroll.' })
    entry(overtime, priya, at(80, 10), { kind: 'action', occurredAt: at(80, 9, 30), title: 'Back pay approved', shortDescription: 'Back pay for all claimed hours, in the next pay run.' })
    status(overtime, priya, at(70, 11), 'resolved', 'Back pay went out in the pay run on the 15th.')
    status(overtime, priya, at(60, 9), 'closed', 'Both confirmed they were paid in full.')

    // Resolved: a back-dated event, a corrected entry and an edit, owned by an Admin.
    const lighting = create(marcus, at(60, 13, 15), {
      title: 'Stairwell lighting at Harbour House',
      shortDescription: 'Back stairwell lights fail at night; staff report near-falls.',
      body: '<p>Callum reports that the lights in the back stairwell go out after about 10 pm and that he has nearly fallen twice carrying laundry down.</p>',
      madeDaysAgo: 61,
      category: 'Health and safety',
      owner: 'E-0988',
      employees: ['E-1356'],
      management: ['E-0761'],
    })
    // Written down days after it happened: its place on the timeline is by when it happened.
    entry(lighting, marcus, at(58, 9), { kind: 'event', occurredAt: at(63, 22, 30), title: 'Earlier near-fall reported by night staff', shortDescription: 'A second support worker says the same happened to them three nights before.' })
    status(lighting, marcus, at(57, 10), 'in_progress', 'Facilities asked to look at it this week.')
    const walk = entry(lighting, marcus, at(55, 15), {
      kind: 'action',
      occurredAt: at(55, 14),
      title: 'Facilities walk-through',
      shortDescription: 'Grant found a faulty timer on the stairwell circuit.',
      files: [textFile('walkthrough-notes.txt', 'Back stairwell: timer relay cuts the circuit at 22:00. Replacement ordered.\n')],
    })
    entry(lighting, marcus, at(54, 9, 10), { kind: 'correction', corrects: walk, title: 'Walk-through was with Ivo, not Grant', body: '<p>Grant was off that day. Ivo Petrov did the walk-through; the finding is the same.</p>' })
    edit(lighting, marcus, at(50, 11), { title: 'Stairwell lights failing at night, Harbour House', shortDescription: 'A timer cuts the back stairwell lights at 10 pm; staff report near-falls.' }, 'The cause is known now, so the title says what is wrong.')
    entry(lighting, marcus, at(21, 16), { kind: 'event', occurredAt: at(22, 10), title: 'Timer replaced', shortDescription: 'Lights now stay on through the night.' })
    status(lighting, marcus, at(20, 9, 30), 'resolved', 'Fixed. Will close once Callum has had a week of night shifts with it.')

    // In progress, handed to someone who cannot sign in, so only a Super Admin can change it; one file withdrawn.
    const accent = create(priya, at(40, 10, 5), {
      title: 'Comments about accent in team meetings',
      shortDescription: 'A clinician says remarks about his accent are made in weekly team meetings.',
      body: '<p>Owen says that in at least three team meetings since August, colleagues have mimicked his accent when repeating what he said.</p><p>He has asked that this be dealt with <em>without</em> naming him to the team for now.</p>',
      madeDaysAgo: 41,
      category: 'Discrimination or harassment',
      owner: 'E-1042',
      employees: ['E-1282'],
      management: ['E-1322'],
    })
    handOver(accent, priya, at(38, 9), 'E-1288', 'HR is taking this on. Alice will lead.')
    status(accent, priya, at(38, 9, 5), 'in_progress', 'Interviews being arranged.')
    entry(accent, priya, at(36, 15), {
      kind: 'action',
      occurredAt: at(36, 13),
      title: 'Interview with Owen',
      shortDescription: 'Owen gave the dates of three meetings and who was present.',
      body: '<p>Agreed next steps:</p><ol><li>Speak to Elena about the meetings, without naming Owen.</li><li>Ask two people present for a statement.</li></ol>',
    })
    const statements = entry(accent, priya, at(30, 11), {
      kind: 'action',
      occurredAt: at(30, 10),
      title: 'Statements taken',
      shortDescription: 'Two people present at the meetings gave statements.',
      files: [textFile('witness-statement-1.txt', 'Statement taken 10:00. Confirms remarks at the meeting on the 4th.\n'), textFile('rota-notes.txt', 'Notes on the Intake rota. Not about this grievance.\n')],
    })
    withdraw(accent, priya, at(29, 9), statements.files[1]!, 'Attached to the wrong grievance by mistake.')

    // Open, with one entry so far.
    const rota = create(marcus, at(12, 11), {
      title: "Rota changes posted with less than a week's notice",
      shortDescription: 'Intake staff say shift changes are posted two or three days ahead.',
      body: '<p>Rosa and Jules say the Intake rota has changed at short notice four times this month, which has cost them childcare they had already paid for.</p>',
      madeDaysAgo: 12,
      category: 'Working conditions',
      owner: 'E-0988',
      employees: ['E-1102', 'E-1304'],
      management: ['E-1315'],
    })
    entry(rota, marcus, at(10, 14), { kind: 'action', occurredAt: at(10, 13), title: 'Asked Intake for the last three rotas', shortDescription: 'Sasha will send them by Friday.' })

    // Voided: entered twice by mistake.
    const twice = create(marcus, at(8, 9), {
      title: 'Short-notice rota changes, Intake',
      shortDescription: 'Shift changes posted two or three days ahead.',
      body: '<p>Rosa says the rota changes at short notice.</p>',
      madeDaysAgo: 12,
      category: 'Working conditions',
      owner: 'E-0988',
      employees: ['E-1102'],
      management: ['E-1315'],
    })
    status(twice, marcus, at(8, 9, 10), 'voided', `Entered twice. This complaint is recorded as ${rota.code}.`)

    return count
  })
}
