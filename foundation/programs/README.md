# `programs` (foundation)

The programs an asset can be issued to instead of a person, such as an outreach site.

## Tables

- `programs` (`server/schema.ts`): Program ID (`code`, unique whatever the letter case), name, address, `is_active`. A program that has held an asset is deactivated, never deleted.

## Resources and rules

- No resource of its own: its page and API go with Assets (`assets`). Read lists them, Edit adds, changes, deactivates and reactivates them, and Full deletes.
- Delete is for a program entered by mistake: anything another module has on it keeps it.
- Deactivate is refused while another module still needs it active (assets it holds). A deactivated program is offered to nobody, and its history still names it.

## Hooks

- Provides `program.references` (`server/references.ts`): each module answers, for a batch of programs, its figures and what keeps them from being deleted or deactivated. The service asks them in registry order, and the first blocker found is the one given. Today only `assignments` answers, for custody.
- Uses `importers` (the Import page's Programs, `programImport`) and the web `exports` (`web/exports.ts`).

## Public API

- `server/index.ts`: the `programs` table, `programRef`, `requireProgram`, `programsWhere`, the reference types, and the demo programs.
- `shared/index.ts`: the importer, the create and update schemas, `ProgramRow`, `ProgramRef`.
- `web/index.ts`: `programsQuery`, `programsExport`.

## Pages

- `/programs` (`web/routes/route.tsx`).

## Gotchas

- Its nav entry is the assets module's (`modules/assets/web/module.ts`), under Assets.
