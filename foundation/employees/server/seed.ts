import type { DbLike } from '#kernel/db/client.ts'
import { employees } from './schema.ts'

// Demo data for `bun run db:seed`: made-up people. `server/seed.ts` inserts them first, in its own place in one random
// sequence, so the rest of the seed comes out the same; it calls `seedEmployees` rather than this module's `seed` hook.
export const DEMO_EMPLOYEES: [string, string, string, string, string][] = [
  ['E-1042', 'Priya', 'Raghunathan', 'IT', 'Systems Analyst'],
  ['E-1130', 'Dana', 'Whitfield', 'Clinical Services', 'Case Manager'],
  ['E-0988', 'Marcus', 'Oyelaran', 'Finance', 'Controller'],
  ['E-1201', 'Tomas', 'Berger', 'Residential', 'Support Worker'],
  ['E-0761', 'Grant', 'Halloway', 'Facilities', 'Maintenance Lead'],
  ['E-1288', 'Alice', 'Nkemdirim', 'HR', 'HR Generalist'],
  ['E-1315', 'Sasha', 'Feldman', 'Intake', 'Intake Coordinator'],
  ['E-0904', 'Aaron', 'Feldman-Rees', 'Finance', 'Analyst'],
  ['E-0442', 'Neil', 'Abernathy', 'Facilities', 'Custodian'],
  ['E-1102', 'Rosa', 'Delgado', 'Intake', 'Intake Specialist'],
  ['E-1177', 'Wen', 'Zhao', 'IT', 'Helpdesk Technician'],
  ['E-1219', 'Bilal', 'Osman', 'Residential', 'Support Worker'],
  ['E-1233', 'Hanna', 'Vuorinen', 'Clinical Services', 'Clinician'],
  ['E-1247', 'Ivo', 'Petrov', 'Facilities', 'Groundskeeper'],
  ['E-1260', 'Nadia', 'Brill', 'HR', 'Recruiter'],
  ['E-1271', 'Kerry', 'Milton', 'Finance', 'Accounts Payable'],
  ['E-1282', 'Owen', 'Castellano', 'Clinical Services', 'Clinician'],
  ['E-1296', 'Mina', 'Haddad', 'Residential', 'House Manager'],
  ['E-1304', 'Jules', 'Okafor', 'Intake', 'Intake Coordinator'],
  ['E-1322', 'Elena', 'Marsh', 'Clinical Services', 'Program Director'],
  ['E-1339', 'Theo', 'Lindqvist', 'IT', 'Network Administrator'],
  ['E-1348', 'Farah', 'Siddiqui', 'Finance', 'Billing Specialist'],
  ['E-1356', 'Callum', 'Reyes', 'Residential', 'Support Worker'],
  ['E-1363', 'Imani', 'Brooks', 'HR', 'Benefits Coordinator'],
]

/** Inserts the demo employees, archiving Neil Abernathy. `daysAgo` is the seed's clock, which also draws from its random sequence. */
export function seedEmployees(db: DbLike, daysAgo: (days: number) => Date) {
  return db
    .insert(employees)
    .values(
      DEMO_EMPLOYEES.map(([code, firstName, lastName, department, jobTitle], i) => ({
        code,
        firstName,
        lastName,
        department,
        jobTitle,
        createdAt: daysAgo(900 - i * 7),
        archivedAt: code === 'E-0442' ? daysAgo(60) : null,
      })),
    )
    .returning()
    .all()
}
