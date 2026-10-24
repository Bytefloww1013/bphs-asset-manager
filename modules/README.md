# Feature modules

One folder per feature: `<name>/{server,shared,web}`, a `README.md`, and tests next to the code. A feature is on when it is listed in `app.modules.ts`. `bun run new-module <name>` makes a new one; [docs/modules.md](../docs/modules.md) is the guide, and [docs/architecture.md](../docs/architecture.md) lists every module.
