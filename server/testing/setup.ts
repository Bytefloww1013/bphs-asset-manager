// Every server, shared and scripts test file runs with every module installed, as `server/index.ts` installs them.
import { SERVER_MODULES } from '../modules.gen.ts'
import { installModules } from '../registry.ts'

installModules(SERVER_MODULES)
