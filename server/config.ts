import path from 'node:path'

const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  /** Absolute path of the built SPA, served by this process in production. */
  webDir: path.resolve(process.env.WEB_DIR ?? './dist/web'),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  sessionIdleHours: int(process.env.SESSION_IDLE_HOURS, 12),
  bootstrapEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@bphs.local').toLowerCase(),
  bootstrapName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Super Admin',
} as const

export const isProduction = config.env === 'production'
