import { describe, expect, it } from 'vitest'
import { CSV_BOM, csvCell, toCsv } from './csv.ts'

describe('CSV output', () => {
  it('quotes what needs quoting and leaves the rest alone', () => {
    expect(csvCell('BPHS-0001')).toBe('BPHS-0001')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell('Delgado, Rosa')).toBe('"Delgado, Rosa"')
    expect(csvCell('15" monitor')).toBe('"15"" monitor"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('stops a cell from being read as a formula by a spreadsheet', () => {
    for (const start of ['=', '+', '-', '@', '\t', '\r'])
      expect(csvCell(`${start}cmd`).replace(/^"/, '').startsWith("'"), JSON.stringify(start)).toBe(true)
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`)
    expect(csvCell(-5)).toBe("'-5")
  })

  it('builds a file with CRLF line ends, and the mark for Excel is one U+FEFF', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          [1, 'x,y'],
          [null, ''],
        ],
      ),
    ).toBe('a,b\r\n1,"x,y"\r\n,\r\n')
    expect(CSV_BOM).toHaveLength(1)
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff)
  })
})
