// Every website test file runs with every module installed, as `main.tsx` installs them.
import { WEB_MODULES } from './modules.gen.ts'
import { installModules } from './registry.ts'

installModules(WEB_MODULES)
