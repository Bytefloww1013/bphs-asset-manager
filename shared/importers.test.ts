import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.ts'
import { employeeImporter } from '#foundation/employees/shared/index.ts'
import { programImporter } from '#foundation/programs/shared/index.ts'
import { autoMap, importRecord, rowProblem } from './importers.ts'

describe('matching a file’s columns to fields', () => {
  it('matches the template headers, whatever their case, spacing or order', () => {
    expect(autoMap(employeeImporter, ['Job title', 'LAST NAME', 'first_name', ' Employee ID ', 'Department'])).toEqual({
      code: 3,
      firstName: 2,
      lastName: 1,
      department: 4,
      jobTitle: 0,
    })
    expect(autoMap(programImporter, ['Program ID', 'Program name', 'Program address'])).toEqual({
      code: 0,
      name: 1,
      address: 2,
    })
  })

  it('falls back on other names a file might use', () => {
    expect(autoMap(employeeImporter, ['Staff ID', 'Surname', 'Forename', 'Dept', 'Position'])).toEqual({
      code: 0,
      firstName: 2,
      lastName: 1,
      department: 3,
      jobTitle: 4,
    })
    expect(autoMap(programImporter, ['Name', 'Code', 'Location'])).toEqual({ code: 1, name: 0, address: 2 })
  })

  it('leaves a field unmatched instead of guessing, and ignores columns it does not know', () => {
    expect(autoMap(employeeImporter, ['Employee ID', 'Full name', '', 'Start date'])).toEqual({
      code: 0,
      firstName: null,
      lastName: null,
      department: null,
      jobTitle: null,
    })
    expect(autoMap(employeeImporter, [])).toEqual({
      code: null,
      firstName: null,
      lastName: null,
      department: null,
      jobTitle: null,
    })
  })

  it('gives a column to one field only, and prefers a field’s own name over another field’s alias', () => {
    // "Title" is an alias of Job title; "Job title" is its own name and wins, so "Title" stays unclaimed.
    expect(autoMap(employeeImporter, ['Title', 'Job title', 'ID', 'First', 'Last'])).toMatchObject({
      jobTitle: 1,
      code: 2,
    })
    // Two columns with the same header: the first is taken, the second is left alone.
    expect(autoMap(programImporter, ['Program ID', 'Program ID', 'Program name'])).toEqual({
      code: 0,
      name: 2,
      address: null,
    })
    // "Program" names the program; "Program ID" is the key, and is not mistaken for it.
    expect(autoMap(programImporter, ['Program', 'ID'])).toEqual({ code: 1, name: 0, address: null })
  })
})

describe('judging a row', () => {
  it('fills in every field, trimmed, and drops what the importer does not know', () => {
    expect(importRecord(programImporter, { code: ' P-1 ', extra: 'x' })).toEqual({
      code: 'P-1',
      name: '',
      address: '',
    })
  })

  it('names every empty required field together, then the first rule broken', () => {
    expect(rowProblem(employeeImporter, importRecord(employeeImporter, { department: 'IT' }))).toBe(
      'missing Employee ID, First name, Last name',
    )
    expect(
      rowProblem(employeeImporter, importRecord(employeeImporter, { code: 'E-1', firstName: 'A', lastName: 'B' })),
    ).toBeNull()
    expect(rowProblem(programImporter, importRecord(programImporter, { code: 'P'.repeat(41), name: 'N' }))).toMatch(
      /Program ID.*40 characters/,
    )
  })
})

describe('reading a CSV', () => {
  it('reads quoted cells, doubled quotes, line breaks inside a cell, CRLF or LF, and drops Excel’s byte-order mark', () => {
    expect(
      parseCsv('\uFEFFEmployee ID,First name\r\nE-1,"Zhao, Wen"\nE-2,"Help ""desk"""\r\nE-3,"two\nlines"'),
    ).toEqual([
      ['Employee ID', 'First name'],
      ['E-1', 'Zhao, Wen'],
      ['E-2', 'Help "desk"'],
      ['E-3', 'two\nlines'],
    ])
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']])
  })
})
