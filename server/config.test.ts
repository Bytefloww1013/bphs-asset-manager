import { describe, expect, it } from 'vitest'
import { readConfig } from './config.ts'

describe('configuration from the environment', () => {
  it('uses the defaults when nothing is set, and reads what is', () => {
    expect(readConfig({})).toMatchObject({ port: 3000, sessionIdleHours: 12, cookieSecure: false })
    expect(readConfig({ PORT: '8080', SESSION_IDLE_HOURS: ' 8 ', COOKIE_SECURE: 'true' })).toMatchObject({
      port: 8080,
      sessionIdleHours: 8,
      cookieSecure: true,
    })
    expect(readConfig({ SESSION_IDLE_HOURS: '' }).sessionIdleHours).toBe(12)
  })

  it('refuses an idle time that would end every session at once, or is not a number', () => {
    for (const value of ['0', '-1', '1.5', '12h', 'twelve', '99999']) {
      expect(() => readConfig({ SESSION_IDLE_HOURS: value })).toThrow(
        `SESSION_IDLE_HOURS must be a whole number from 1 to 8760, but it is "${value}".`,
      )
    }
  })

  it('refuses a port that cannot be listened on', () => {
    for (const value of ['0', '70000', 'http'])
      expect(() => readConfig({ PORT: value })).toThrow(/^PORT must be a whole number from 1 to 65535/)
  })

  it('turns the maintenance webhook on only with a secret long enough to resist guessing', () => {
    expect(readConfig({}).maintenanceWebhookSecret).toBeUndefined()
    expect(readConfig({ MAINTENANCE_WEBHOOK_SECRET: '  ' }).maintenanceWebhookSecret).toBeUndefined()
    expect(readConfig({ MAINTENANCE_WEBHOOK_SECRET: 'k'.repeat(32) }).maintenanceWebhookSecret).toBe('k'.repeat(32))
    expect(() => readConfig({ MAINTENANCE_WEBHOOK_SECRET: 'short' })).toThrow(
      /^MAINTENANCE_WEBHOOK_SECRET must be at least 32 characters/,
    )
  })
})
