# `employees` (foundation)

The people every workspace names: who holds an asset, owns a grievance, is reviewed or dispatched on a request. Accounts (Users) are linked to an employee, but are not one.

## Tables

- `employees` (`server/schema.ts`): Employee ID (`code`, unique), first and last name, department, job title, `archived_at`. An employee with history is archived, never deleted.

## Resources and rules

- `employees` (not a workspace). Every account may list employees, so any form can name one; None only hides the Employees page. Edit adds and changes them; Full archives, restores and deletes.
- The Employee ID is unique whatever the letter case, and is never reused by an import: a row whose ID is taken is skipped.
- Delete is for a record entered by mistake. Anything another module has on the employee keeps them, and so does a linked account (checked last). Someone who can't see every workspace is told only that there are records they cannot see.
- Archive is refused while another module still needs them here (assets held, an open grievance owned, open review work). Restoring asks nobody.
- Its figures (assets held, open grievances owned, open reviews and CAPs) come from the modules that own them, and read as nothing to an account that can't see that workspace.

## Hooks

- Provides `employee.references` (`server/references.ts`): each module answers, for a batch of employees, its figures and what keeps them from being deleted or archived. The service asks them in registry order, and the first blocker found is the one given. Today `assignments` answers for custody, `assets` for the conditions they assessed, `grievances` and `reviews` for their open work, and `maintenance` for dispatched requests.
- Uses `importers` (the Import page's Employees, `employeeImport`) and the web `exports` (`web/exports.ts`).

## Public API

- `server/index.ts`: the `employees` table, `employeeRef`, `fullName`, `requireEmployee`, `requireActiveEmployees` (refuses anyone archived or gone), `employeesWhere`, `HIDDEN_BLOCK`, the reference types, and the seed.
- `shared/index.ts`: the importer, the create and update schemas, `EmployeeRow`, `EmployeeRef`.
- `web/index.ts`: `EmployeesPage` and `employeesSearch` (Reviews and Grievances show it in their workspaces), `employeesQuery`, `employeesExport`.

## Pages

- `/employees` (`web/routes/index.tsx`), and `/employees/import`, which now sends old links to the Import & Export page.

## Gotchas

- `web/employee-parts.tsx` knows no feature module: what an employee holds, and the actions on it, come through the `employee.actions` and `employee.holdings` slots (`employee.detail` is drawn too, but no module fills it yet).
- Its Assets nav entry is the assets module's (`modules/assets/web/module.ts`); Grievances and Reviews list their own.
