# Foundation modules

Modules every feature can build on: `employees`, `programs`, `assignments` (custody), `audit` and `notifications`. `app.modules.ts` lists only feature modules.

A foundation module never depends on, or imports, a feature module (lint rule `boundaries/imports`, rule b). To learn something from the features (what an employee holds, a kind of custody), it asks a hook instead. How modules are built is in [docs/modules.md](../docs/modules.md), and where they sit in the app in [docs/architecture.md](../docs/architecture.md).
