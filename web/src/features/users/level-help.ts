import type { AccessLevel, Section } from '@shared/constants.ts'

/** What each level allows in each section, as the "i" button beside the section's levels explains it. */
export const LEVEL_HELP: Record<Section, Record<AccessLevel, string>> = {
  assets: {
    none: 'The Assets workspace is hidden.',
    read: 'See assets, digital assets, assignments, programs, lists, the Overview and the Audit Log, and export them.',
    edit: 'Also add and change all of these, issue and return assets, and import.',
    full: 'Also delete assets, digital assets, programs and list values.',
  },
  grievances: {
    none: 'The Grievances workspace is hidden.',
    read: "See every grievance, with its timeline, files and earlier versions, and the Grievance Audit Log. Print the case file and download files. The account linked to a grievance's owner can also edit that grievance, change its status and give it to another owner.",
    edit: 'Also create grievances; add actions, events, corrections and files; edit any grievance and change its status or owner; and add or rename categories.',
    full: 'Also void a grievance, withdraw a file and delete a category.',
  },
  maintenance: {
    none: 'The Maintenance workspace is hidden.',
    read: 'See every request and its timeline.',
    edit: 'Also enter requests, dispatch them, change their status and add notes.',
    full: 'Also delete a request.',
  },
  reviews: {
    none: 'The Administrative Reviews workspace is hidden.',
    read: "See every review, with its CAPs, history and files, download files and print the report. The account linked to a review's reviewer can also do what Edit allows on that review. No one is shown a review of themselves, and an account not linked to an employee is shown none.",
    edit: 'Also create reviews, and add or change CAPs, updates, files and status on any review.',
    full: 'Also void a review and withdraw a file.',
  },
  employees: {
    none: 'The Employees page is hidden. Employees can still be chosen in any form.',
    read: 'See the Employees page.',
    edit: 'Also add and change employees.',
    full: 'Also archive, restore and delete them.',
  },
}
