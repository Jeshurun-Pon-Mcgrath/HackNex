import * as XLSX from 'xlsx'
import { parseCsvText, parseWorkbookSheet, type PreparedWorkbook } from '../lib/parsers'
import { csvFixtures, csvMetadata } from './fixtures'

describe('local dataset parsers', () => {
  it('parses CSV metadata, headers, and real rows', () => {
    const dataset = parseCsvText(csvFixtures.valid, csvMetadata())
    expect(dataset).toMatchObject({
      fileName: 'fixture.csv',
      fileType: 'csv',
      rowCount: 2,
      columnCount: 2,
    })
    expect(dataset.headers.map(({ header }) => header)).toEqual(['name', 'age'])
    expect(dataset.rows[0]).toEqual({ column_1: 'Ada', column_2: '36' })
  })

  it('preserves duplicate headers with distinct internal keys', () => {
    const dataset = parseCsvText(
      csvFixtures.duplicateHeaders,
      csvMetadata('duplicate.csv', csvFixtures.duplicateHeaders),
    )
    expect(dataset.headers.map(({ key }) => key)).toEqual(['column_1', 'column_2'])
    expect(dataset.parseWarnings.some(({ code }) => code === 'DUPLICATE_HEADER')).toBe(true)
  })

  it('reports malformed CSV input without exposing row contents', () => {
    const dataset = parseCsvText(
      csvFixtures.malformed,
      csvMetadata('malformed.csv', csvFixtures.malformed),
    )
    expect(dataset.parseWarnings.length).toBeGreaterThan(0)
    expect(dataset.parseWarnings.map(({ message }) => message).join(' ')).not.toContain('Ada')
  })

  it('keeps multi-sheet workbooks separate and records the selected worksheet', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name'], ['Ada']]), 'People')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['amount'], [10]]), 'Amounts')
    const prepared: PreparedWorkbook = {
      workbook,
      sheets: workbook.SheetNames.map((name, index) => ({ name, index })),
      metadata: {
        name: 'book.xlsx',
        type: 'xlsx',
        size: 100,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        lastModified: 0,
      },
    }
    const dataset = parseWorkbookSheet(prepared, 'Amounts')
    expect(dataset.availableSheets.map(({ name }) => name)).toEqual(['People', 'Amounts'])
    expect(dataset.selectedSheet).toBe('Amounts')
    expect(dataset.rows[0].column_1).toBe(10)
  })
})
