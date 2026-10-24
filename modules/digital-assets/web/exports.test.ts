import { describe, expect, it } from 'vitest'
import { digitalAssetsExport } from './exports.ts'

describe('the digital assets export', () => {
  it('carries none of the physical asset columns', () => {
    expect(
      digitalAssetsExport.headers.filter((header) => ['Brand', 'Model', 'Entra ObjectId'].includes(header)),
    ).toEqual([])
  })
})
