import { parseCsvText } from '../lib/parsers'
import { buildQualityReport, inferDataType } from '../lib/quality'
import { csvFixtures, csvMetadata } from './fixtures'

function reportFor(key: keyof typeof csvFixtures) {
  const content = csvFixtures[key]
  return buildQualityReport(parseCsvText(content, csvMetadata(`${key}.csv`, content)))
}

describe('deterministic data-quality scanner', () => {
  it('detects missing values and percentages', () => {
    const report = reportFor('missing')
    const score = report.columns.find(({ header }) => header === 'score')
    expect(score).toMatchObject({ missingCount: 2 })
    expect(score?.missingPercentage).toBeCloseTo(66.67, 1)
  })

  it('detects exact duplicate rows beyond the first occurrence', () => {
    const report = reportFor('duplicates')
    expect(report.duplicateCount).toBe(1)
    expect(report.duplicateRowIndices).toEqual([3])
  })

  it('infers deterministic data types', () => {
    expect(inferDataType(['1', '2', null])).toBe('Integer')
    expect(inferDataType(['1', '2.5'])).toBe('Decimal')
    expect(inferDataType(['true', false])).toBe('Boolean')
    expect(inferDataType(['text', '3'])).toBe('Mixed')
  })

  it('reports invalid values in a mostly numeric column', () => {
    const report = reportFor('invalidNumeric')
    const amount = report.columns.find(({ header }) => header === 'amount')
    expect(amount?.invalidNumericCount).toBe(1)
    expect(amount?.invalidNumericRows).toEqual([5])
  })

  it('reports mixed and ambiguous dates without guessing a locale', () => {
    const report = reportFor('mixedDates')
    const date = report.columns.find(({ header }) => header === 'date')
    expect(date?.dateFormats).toEqual(
      expect.arrayContaining(['ISO 8601', 'DD/MM/YYYY', 'Ambiguous day/month']),
    )
    expect(date?.ambiguousDateRows).toEqual([3])
  })

  it('detects explicit currency inconsistency', () => {
    const report = reportFor('mixedCurrencies')
    expect(report.columns.find(({ header }) => header === 'price')?.currencies).toEqual(
      expect.arrayContaining(['$', 'EUR']),
    )
  })

  it('calculates IQR bounds and numeric outliers', () => {
    const report = reportFor('outliers')
    const detail = report.outliers.find(({ header }) => header === 'value')
    expect(detail).toMatchObject({
      q1: 2,
      q3: 3,
      iqr: 1,
      lowerBound: 0.5,
      upperBound: 4.5,
      outlierCount: 1,
      rowIndices: [5],
    })
  })
})
