import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Env } from '../http.ts'
import { GRIEVANCE_ADMIN, setup } from '../testing/index.ts'
import { declarationOf, open, requires, serviceDecides, superAdmin, undeclaredRoutes } from './route.ts'

const handler = () => new Response('ok')

describe('route declarations', () => {
  it('tags each declaration so the route walk can find it', () => {
    expect(declarationOf(requires('assets', 'edit'))).toEqual({ needs: 'level', resource: 'assets', level: 'edit' })
    expect(declarationOf(serviceDecides('tasks'))).toEqual({ needs: 'service', resource: 'tasks' })
    expect(declarationOf(open())).toEqual({ needs: 'signed-in' })
    expect(declarationOf(superAdmin())).toEqual({ needs: 'super-admin' })
    expect(declarationOf(handler)).toBeUndefined()
  })

  it('lists every route whose first handler is not a declaration, and skips use() middleware', () => {
    const sub = new Hono<Env>()
    sub.get('/', requires('assets', 'read'), handler)
    sub.post('/', handler)
    sub.patch('/:id', handler, requires('assets', 'edit'), handler)
    const app = new Hono<Env>()
    app.use('*', async (_c, next) => next())
    app.route('/assets', sub)
    app.all('/stray', handler)
    expect(undeclaredRoutes(app)).toEqual(['POST /assets', 'PATCH /assets/:id', 'ALL /stray'])
  })

  it('starts with every API route declared, and refuses a path none declares', async () => {
    const t = await setup()
    t.addUser('g.only@bphs.local', { access: GRIEVANCE_ADMIN })
    const grievancesOnly = (await t.signIn('g.only@bphs.local')).cookie
    // Before, an unknown path was checked against Assets: 403 for this account, and let through for one with Assets access.
    expect((await t.call('GET', '/api/assets/nothing/here', { cookie: grievancesOnly })).status).toBe(404)
    expect((await t.call('POST', '/api/__undeclared__', { cookie: await t.asAdmin() })).status).toBe(404)
    expect((await t.call('POST', '/api/notices/1', { cookie: await t.asAdmin() })).status).toBe(404)
    expect((await t.call('GET', '/api/__undeclared__')).status).toBe(401)
    t.sqlite.close()
  })
})
