// Demo data for `bun run db:seed`: made-up programs. `server/seed.ts` inserts them after the fleet, in its own place in one
// random sequence, with their audit entries and the equipment they hold.
export const DEMO_PROGRAMS: [string, string, string | null, boolean][] = [
  // Program ID, name, address, active
  ['PRG-100', 'Harbour House Residential', '14 Harbour Road', true],
  ['PRG-110', 'Maple Court Residential', '220 Maple Court', true],
  ['PRG-200', 'Downtown Intake Centre', '5 King Street, Suite 300', true],
  ['PRG-310', 'Youth Outreach', '88 Mill Lane', true],
  ['PRG-400', 'Day Program', null, true],
  ['PRG-090', 'Northside Drop-in', '41 Alder Avenue', false],
]
