import { SHARED_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/**
 * Administrative Reviews: each review with its Corrective Action Plans, history and files, and a Review Audit Log of its own.
 * Confidential, so it never notifies, shows no counts and writes nothing to the Audit Log. A review is never shown to the
 * employee it is about.
 */
export default defineSharedManifest({
  id: 'reviews',
  tier: 'feature',
  label: 'Administrative Reviews',
  dependsOn: ['employees', 'audit'],
  confidential: true,
  resources: [
    {
      key: 'reviews',
      label: 'Administrative Reviews',
      levels: SHARED_LEVELS,
      help: {
        none: 'The Administrative Reviews workspace is hidden.',
        read: "See every review, with its CAPs, history and files, download files and print the report. The account linked to a review's reviewer can also do what Edit allows on that review. No one is shown a review of themselves, and an account not linked to an employee is shown none.",
        edit: 'Also create reviews, and add or change CAPs, updates, files and status on any review.',
        full: 'Also void a review and withdraw a file.',
      },
      workspace: true,
      order: 40,
      // A review is hidden from the employee it is about, so an account that is nobody cannot be shown any (R9).
      available: (user) => user.employeeId !== null || user.firstAccount === true,
    },
  ],
  routePrefix: '/reviews',
})
