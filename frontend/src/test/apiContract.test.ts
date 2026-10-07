import { analysisPlanResponseSchema } from '../api/contracts'
import { buildAnalysisPlanRequest } from '../api/requestBuilder'
import { createSpecification } from '../lib/analysisRules'
import { parseCsvText } from '../lib/parsers'
import { buildQualityReport } from '../lib/quality'
import type { AnalysisFormValues } from '../types/analysis'
import { csvMetadata } from './fixtures'

it('rejects invalid future backend responses', () => {
  expect(() => analysisPlanResponseSchema.parse({ status: 'ready', result: 42 })).toThrow()
})

it('builds an API request without complete dataset rows', () => {
  const content = 'name,value\nA,1\nB,2'
  const dataset = parseCsvText(content, csvMetadata('request.csv', content))
  const report = buildQualityReport(dataset)
  const values: AnalysisFormValues = {
    question: 'How many rows are present?',
    metricKind: 'row_count',
    metricColumn: '',
    leftColumn: '',
    arithmeticOperator: 'add',
    rightColumn: '',
    derivedDisplayName: '',
    aggregation: 'count',
    groupBy: [],
    filters: [],
    sortTarget: 'metric',
    sortDirection: 'descending',
    limit: 1,
    confirmMissingExclude: false,
    confirmDuplicateKeep: false,
    dateInterpretation: '',
    divisionHandling: '',
  }
  const request = buildAnalysisPlanRequest(dataset, report, createSpecification(values, dataset))
  expect(request.datasetSchema).toHaveLength(2)
  expect(request).not.toHaveProperty('rows')
  expect(JSON.stringify(request)).not.toContain('"A"')
})
