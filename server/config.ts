import path from 'node:path'

const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())

/** A whole number from the environment. A value that is set but unusable stops the server, rather than quietly becoming something else. */
function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const value = env[name]?.trim()
  if (!value) return fallback
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!(parsed >= min && parsed <= max))
    throw new Error(`${name} must be a whole number from ${min} to ${max}, but it is "${value}".`)
  return parsed
}

/** A shared secret, or undefined when it is not set. One that is set but short is a mistake worth stopping for. */
function secret(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim()
  if (!value) return undefined
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters; make one with: openssl rand -hex 32`)
  return value
}

export function readConfig(env: NodeJS.ProcessEnv) {
  return {
    env: env.NODE_ENV ?? 'development',
    port: int(env, 'PORT', 3000, 1, 65535),
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    /** Absolute path of the built SPA, served by this process in production. */
    webDir: path.resolve(env.WEB_DIR ?? './dist/web'),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    /** At least an hour: with 0 or less every session would have expired the moment it was made, and nobody could sign in. */
    sessionIdleHours: int(env, 'SESSION_IDLE_HOURS', 12, 1, 8760),
    bootstrapEmail: (env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@bphs.local').toLowerCase(),
    bootstrapName: env.BOOTSTRAP_ADMIN_NAME ?? 'Super Admin',
    maintenanceWebhookSecret: secret(env, 'MAINTENANCE_WEBHOOK_SECRET'),
  } as const
}

function load() {
  try {
    return readConfig(process.env)
  } catch (error) {
    console.error(`Configuration error: ${(error as Error).message}`)
    process.exit(1)
  }
}

export const config = load()

export const isProduction = config.env === 'production'
