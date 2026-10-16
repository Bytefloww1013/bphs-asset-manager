import type { QueryClient } from '@tanstack/react-query'
import { grievanceEntryCode, grievanceEntryKindLabel, grievanceStatusLabel } from '@shared/constants.ts'
import { richTextToPlain } from '@shared/richtext.ts'
import type { GrievancePerson } from '@shared/types.ts'
import { fileSize } from '@/features/common/files.tsx'
import { api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { grievanceAttachmentsQuery, grievanceEntriesQuery, grievanceQuery, grievanceVersionsQuery } from '@/lib/queries.ts'
import { downloadWorkbook } from '@/lib/spreadsheet.ts'

const names = (people: Pick<GrievancePerson, 'code' | 'name'>[]) => people.map((person) => `${person.name} (${person.code})`).join('; ')

/**
 * The whole grievance as a workbook: the grievance, its timeline, its files and its earlier versions, a sheet each. Every
 * value is text. The export is logged before the file is made, so no copy leaves without an entry in the audit log.
 */
export async function downloadGrievanceWorkbook(queryClient: QueryClient, code: string) {
  const [grievance, entries, files, versions] = await Promise.all([
    queryClient.fetchQuery({ ...grievanceQuery(code), staleTime: 0 }),
    queryClient.fetchQuery({ ...grievanceEntriesQuery(code), staleTime: 0 }),
    queryClient.fetchQuery({ ...grievanceAttachmentsQuery(code), staleTime: 0 }),
    queryClient.fetchQuery({ ...grievanceVersionsQuery(code), staleTime: 0 }),
  ])
  await api.post(`/grievances/${encodeURIComponent(grievance.code)}/exports`, { format: 'xlsx' })
  const entryId = (seq: number) => `${grievance.code}-${grievanceEntryCode(seq)}`

  await downloadWorkbook(`${grievance.code}.xlsx`, [
    {
      name: 'Grievance',
      header: ['Field', 'Value'],
      rows: [
        ['Grievance ID', grievance.code],
        ['Title', grievance.title],
        ['Short Description', grievance.shortDescription],
        ['Status', grievanceStatusLabel(grievance.status)],
        ['Category', grievance.category.name],
        ['Date Made', grievance.dateMade],
        ['Owner', names([grievance.owner])],
        ['Employees Involved', names(grievance.employees)],
        ['Management Involved', names(grievance.management)],
        ['Recorded By', grievance.recordedBy ?? 'A removed account'],
        ['Recorded At', formatDateTime(grievance.createdAt)],
        ['Version', String(grievance.version)],
        ['Last Activity', formatDateTime(grievance.lastActivityAt)],
        ['Body', richTextToPlain(grievance.bodyHtml)],
        ['Exported At', formatDateTime(new Date().toISOString())],
      ],
    },
    {
      name: 'Timeline',
      header: ['Entry ID', 'Grievance ID', 'Type', 'Occurred At', 'Recorded At', 'Title', 'Short Description', 'Body', 'Documented By', 'Corrects'],
      rows: [...entries]
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq)
        .map((entry) => [
          entryId(entry.seq),
          grievance.code,
          grievanceEntryKindLabel(entry.kind),
          formatDateTime(entry.occurredAt),
          formatDateTime(entry.recordedAt),
          entry.title,
          entry.shortDescription,
          richTextToPlain(entry.bodyHtml),
          entry.documentedBy,
          entry.corrects === null ? '' : entryId(entry.corrects),
        ]),
    },
    {
      name: 'Attachments',
      header: ['File Name', 'Entry ID', 'Size', 'Type', 'SHA-256', 'Added By', 'Added At', 'Withdrawn At', 'Withdrawal Reason'],
      rows: files.map((file) => [
        file.filename,
        file.entrySeq === null ? '' : entryId(file.entrySeq),
        fileSize(file.size),
        file.contentType,
        file.sha256,
        file.uploadedBy,
        formatDateTime(file.uploadedAt),
        file.withdrawnAt ? formatDateTime(file.withdrawnAt) : '',
        file.withdrawnReason,
      ]),
    },
    {
      name: 'Versions',
      header: ['Version', 'Title', 'Short Description', 'Date Made', 'Category', 'Employees Involved', 'Management Involved', 'Body', 'Replaced By', 'Replaced At', 'Reason'],
      rows: versions.map((version) => [
        String(version.version),
        version.title,
        version.shortDescription,
        version.dateMade,
        version.category,
        names(version.employees),
        names(version.management),
        richTextToPlain(version.bodyHtml),
        version.changedBy,
        formatDateTime(version.changedAt),
        version.reason,
      ]),
    },
  ])
}
