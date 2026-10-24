// The employees module's public API, server side: what other modules and the kernel may import from it.
export { employees } from './schema.ts'
export { employeeRef, fullName, requireActiveEmployees, requireEmployee } from './refs.ts'
export { employeesWhere, HIDDEN_BLOCK } from './references.ts'
export type { EmployeeFigures, EmployeeReference, EmployeeReferences, EmployeeViewer } from './references.ts'
export { DEMO_EMPLOYEES, seedEmployees } from './seed.ts'
