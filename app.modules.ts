// Every feature module, in registry order (issue #23): after the foundation modules, each after the modules it depends on.
// The order decides which module answers a hook first, such as the blocker an employee refusal names. `modules:gen` refuses a
// folder in modules/ that this list leaves out: every module is always installed. `bun run new-module` adds the line.
// After a change, run `bun run modules:gen` (the dev server does it for you) to rewrite the generated registries.
export const FEATURES = ['assets', 'digital-assets', 'grievances', 'maintenance', 'reviews', 'tasks'] as const
