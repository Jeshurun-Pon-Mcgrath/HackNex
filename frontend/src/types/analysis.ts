import type { InferredDataType } from './dataset'

export type ArithmeticOperator = 'add' | 'subtract' | 'multiply' | 'divide'
export type Aggregation = 'sum' | 'average' | 'count' | 'count_distinct' | 'minimum' | 'maximum'
export type SortDirection = 'ascending' | 'descending'
export type ContractState = 'satisfied' | 'backend_decision' | 'user_clarification' | 'blocking'

export type AnalysisMetric =
  | { kind: 'column'; column: string }
  | { kind: 'row_count' }
  | {
      kind: 'derived'
      leftColumn: string
      operator: ArithmeticOperator
      rightColumn: string
      displayName: string
    }

export type AnalysisFilter = {
  column: string
  operator: string
  value?: string
  secondValue?: string
  interpretMixedAsText?: boolean
}

export type AnalysisSpecification = {
  version: '1.0'
  datasetId: string
  question: string
  metric: AnalysisMetric
  aggregation: Aggregation
  groupBy: string[]
  filters: AnalysisFilter[]
  sort: { target: string; direction: SortDirection }
  limit: 1 | 5 | 10 | 25 | 50 | 100
  requiredColumns: string[]
  assumptions: string[]
  createdAt: string
}

export type ProofContractItem = {
  id: string
  requirement: string
  state: ContractState
  columnKey?: string
}

export type AnalysisFormValues = {
  question: string
  metricKind: '' | 'column' | 'row_count' | 'derived'
  metricColumn: string
  leftColumn: string
  arithmeticOperator: ArithmeticOperator
  rightColumn: string
  derivedDisplayName: string
  aggregation: '' | Aggregation
  groupBy: string[]
  filters: AnalysisFilter[]
  sortTarget: string
  sortDirection: SortDirection
  limit: 1 | 5 | 10 | 25 | 50 | 100
  confirmMissingExclude: boolean
  confirmDuplicateKeep: boolean
  dateInterpretation: '' | 'day_first' | 'month_first'
  divisionHandling: '' | 'exclude' | 'null'
}

export type DatasetSchemaSummaryColumn = {
  key: string
  label: string
  inferredType: InferredDataType
  missingCount: number
}
