// The programs module's public API, server side: what other modules and the kernel may import from it.
export { programs } from './schema.ts'
export { programRef, requireProgram } from './refs.ts'
export { programsWhere } from './references.ts'
export type { ProgramFigures, ProgramReference, ProgramReferences } from './references.ts'
export { DEMO_PROGRAMS } from './seed.ts'
