import { describe, expect, it } from 'vitest'
import type { AssetRow, AssignmentRow } from '@shared/types.ts'
import { EXPORTS } from './exports.ts'

// A device's Microsoft Entra object ID, as the server stores it: a lowercase UUID.
const entra = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const asset = (overrides: Partial<AssetRow> = {}): AssetRow => ({
  id: 1,
  tag: 'BPHS-0001',
  typeId: 1,
  type: 'Laptop',
  brandId: 2,
  brand: 'Dell',
  brandActive: true,
  model: 'Latitude 5440',
  entraObjectId: entra,
  serial: 'SN-1',
  status: 'in_service',
  state: 'in_storage',
  holder: null,
  program: null,
  assignmentId: null,
  condition: null,
  issuedAt: null,
  daysOut: null,
  lastReturnedAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  hasHistory: false,
  ...overrides,
})

const assignment = (overrides: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 7,
  assetId: 1,
  assetTag: 'BPHS-0001',
  assetType: 'Laptop',
  assetBrand: 'Dell',
  assetModel: 'Latitude 5440',
  assetEntraObjectId: entra,
  employee: { id: 1, code: 'E001', name: 'Priya Shah', department: 'IT' },
  program: null,
  issuedAt: '2026-10-02T09:00:00.000Z',
  issueRating: 'Good',
  daysOut: 20,
  issuedBy: 'priya',
  ...overrides,
})

const identity = ['Type', 'Brand', 'Model', 'Entra ObjectId']

/** A row's cells under Type, Brand, Model and Entra ObjectId. */
const cells = <T>(dataset: { headers: string[]; row: (item: T) => unknown[] }, item: T) => {
  const row = dataset.row(item)
  return identity.map((header) => row[dataset.headers.indexOf(header)])
}

describe('exports that list a physical asset', () => {
  it('put Brand, Model and Entra ObjectId right after Type', () => {
    for (const { headers } of [EXPORTS.assets, EXPORTS.assignments]) {
      const type = headers.indexOf('Type')
      expect(headers.slice(type, type + 4)).toEqual(identity)
    }
    expect(EXPORTS.assets.headers.slice(0, 6)).toEqual(['Asset tag', ...identity, 'Serial'])
    expect(EXPORTS.assignments.headers.slice(0, 6)).toEqual(['Asset tag', ...identity, 'Holder type'])
  })

  it('have a cell for every header', () => {
    expect(EXPORTS.assets.row(asset())).toHaveLength(EXPORTS.assets.headers.length)
    expect(EXPORTS.assignments.row(assignment())).toHaveLength(EXPORTS.assignments.headers.length)
  })

  it('fill in the brand, model and Entra ObjectId', () => {
    expect(cells(EXPORTS.assets, asset())).toEqual(['Laptop', 'Dell', 'Latitude 5440', entra])
    expect(cells(EXPORTS.assignments, assignment())).toEqual(['Laptop', 'Dell', 'Latitude 5440', entra])
  })

  it('leave the cells empty for no model and no Entra ObjectId', () => {
    // The spreadsheet writer turns null into an empty cell, in CSV and XLSX alike.
    expect(cells(EXPORTS.assets, asset({ model: null, entraObjectId: null }))).toEqual(['Laptop', 'Dell', null, null])
    expect(cells(EXPORTS.assignments, assignment({ assetModel: null, assetEntraObjectId: null }))).toEqual([
      'Laptop',
      'Dell',
      null,
      null,
    ])
  })

  it('name an archived brand like any other', () => {
    expect(cells(EXPORTS.assets, asset({ brandId: 1, brand: 'Unknown', brandActive: false }))[1]).toBe('Unknown')
  })
})

describe('exports that list no physical asset', () => {
  it('carry none of the asset columns', () => {
    for (const { headers } of [EXPORTS.digitalAssets, EXPORTS.employees, EXPORTS.programs]) {
      expect(headers.filter((header) => identity.slice(1).includes(header))).toEqual([])
    }
  })
})
