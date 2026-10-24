import type { RecordFiles } from '@/components/records/files.tsx'
import { reviewCapCode } from '../shared/index.ts'

/** A review's files, as the kernel's file lists show them: each may belong to one of its CAPs. */
export const reviewFiles: RecordFiles = { section: 'reviews', noun: 'review', log: 'history', itemCode: reviewCapCode }
