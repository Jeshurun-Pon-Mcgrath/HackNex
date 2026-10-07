import {
  buildProofContract,
  compatibleAggregations,
  createSpecification,
  filterOperators,
  validateAnalysis,
} from '../lib/analysisRules'
import { parseCsvText } from '../lib/parsers'
import { buildQualityReport } from '../lib/quality'
import type { AnalysisFormValues } from '../types/analysis'
import { csvMetadata } from './fixtures'

const content =
  'region,profit,cost,date,price\nNorth,10,2,01/02/2024,$10\nNorth,10,2,01/02/2024,EUR 10\nNorth,10,2,01/02/2024,$10\nSouth,100,0,13/02/2024,$20'
const dataset = parseCsvText(content, csvMetadata('analysis.csv', content))
const report = buildQualityReport(dataset)
const keys = Object.fromEntries(dataset.headers.map((column) => [column.header, column.key]))
const base: AnalysisFormValues = {
  question: 'Which region has the highest total profit?',
  metricKind: 'column',
  metricColumn: keys.profit,
  leftColumn: '',
  arithmeticOperator: 'add',
  rightColumn: '',
  derivedDisplayName: '',
  aggregation: 'sum',
  groupBy: [keys.region],
  filters: [],
  sortTarget: 'metric',
  sortDirection: 'descending',
  limit: 10,
  confirmMissingExclude: false,
  confirmDuplicateKeep: true,
  dateInterpretation: '',
  divisionHandling: '',
}

describe('analysis specification rules', () => {
  it('supports direct, row-count, and derived metric aggregation rules', () => {
    expect(
      compatibleAggregations(
        'column',
        dataset.headers.find((column) => column.key === keys.profit),
      ),
    ).toContain('average')
    expect(compatibleAggregations('row_count')).toEqual(['count'])
    expect(compatibleAggregations('derived')).not.toContain('count_distinct')
  })

  it('constructs a derived metric and requires division handling', () => {
    const values: AnalysisFormValues = {
      ...base,
      metricKind: 'derived',
      metricColumn: '',
      leftColumn: keys.profit,
      arithmeticOperator: 'divide',
      rightColumn: keys.cost,
      derivedDisplayName: 'Profit per cost',
      divisionHandling: '',
    }
    expect(
      validateAnalysis(values, dataset, report).some(({ field }) => field === 'divisionHandling'),
    ).toBe(true)
    values.divisionHandling = 'null'
    const specification = createSpecification(values, dataset)
    expect(specification.metric).toEqual({
      kind: 'derived',
      leftColumn: keys.profit,
      operator: 'divide',
      rightColumn: keys.cost,
      displayName: 'Profit per cost',
    })
    expect(buildProofContract(values, dataset, report)).toContainEqual(
      expect.objectContaining({ id: 'division', state: 'satisfied' }),
    )
  })

  it('prevents incompatible aggregation, duplicate grouping, incomplete filters, and invalid sorting', () => {
    const invalid: AnalysisFormValues = {
      ...base,
      aggregation: 'count_distinct',
      groupBy: [keys.region, keys.region],
      filters: [{ column: keys.profit, operator: 'between', value: '1' }],
      sortTarget: `group:${keys.date}`,
    }
    const fields = validateAnalysis(invalid, dataset, report).map(({ field }) => field)
    expect(fields).toEqual(
      expect.arrayContaining(['groupBy', 'filters.0.secondValue', 'sortTarget']),
    )
  })

  it('provides type-aware filter operators', () => {
    expect(filterOperators('Decimal')).toContain('greater_than')
    expect(filterOperators('Date')).toContain('before')
    expect(filterOperators('Boolean')).toContain('is_true')
    expect(filterOperators('Mixed')).toEqual(['is_missing', 'is_not_missing'])
    expect(filterOperators('Mixed', true)).toContain('contains')
  })

  it('sets result limits from grouping and restricts overall results to one', () => {
    expect(createSpecification(base, dataset).limit).toBe(10)
    expect(createSpecification({ ...base, groupBy: [], limit: 100 }, dataset).limit).toBe(1)
  })

  it('derives proof requirements from real currency, date, and duplicate findings', () => {
    const values: AnalysisFormValues = {
      ...base,
      metricColumn: keys.price,
      aggregation: 'count',
      filters: [{ column: keys.date, operator: 'is_not_missing' }],
      confirmDuplicateKeep: false,
    }
    const contract = buildProofContract(values, dataset, report)
    expect(contract).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'currency', state: 'backend_decision' }),
        expect.objectContaining({ id: 'dates', state: 'user_clarification' }),
        expect.objectContaining({ id: 'duplicates', state: 'user_clarification' }),
      ]),
    )
  })
})
