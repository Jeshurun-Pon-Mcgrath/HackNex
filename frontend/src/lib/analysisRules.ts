import type {
  ActiveDataset,
  DataQualityReport,
  DatasetColumn,
  InferredDataType,
} from '../types/dataset'
import type {
  Aggregation,
  AnalysisFormValues,
  AnalysisMetric,
  AnalysisSpecification,
  ProofContractItem,
} from '../types/analysis'

export const operatorLabels: Record<string, string> = {
  equals: 'Equals',
  not_equals: 'Does not equal',
  contains: 'Contains',
  starts_with: 'Starts with',
  greater_than: 'Greater than',
  greater_or_equal: 'Greater than or equal',
  less_than: 'Less than',
  less_or_equal: 'Less than or equal',
  between: 'Between',
  is_missing: 'Is missing',
  is_not_missing: 'Is not missing',
  on: 'On',
  before: 'Before',
  after: 'After',
  is_true: 'Is true',
  is_false: 'Is false',
}

export function filterOperators(type: InferredDataType, mixedAsText = false) {
  const missing = ['is_missing', 'is_not_missing']
  if (type === 'Integer' || type === 'Decimal')
    return [
      'equals',
      'not_equals',
      'greater_than',
      'greater_or_equal',
      'less_than',
      'less_or_equal',
      'between',
      ...missing,
    ]
  if (type === 'Date') return ['on', 'before', 'after', 'between', ...missing]
  if (type === 'Boolean') return ['is_true', 'is_false', ...missing]
  if (type === 'Mixed' && !mixedAsText) return missing
  return ['equals', 'not_equals', 'contains', 'starts_with', ...missing]
}

export function compatibleAggregations(
  metricKind: AnalysisFormValues['metricKind'],
  column?: DatasetColumn,
): Aggregation[] {
  if (metricKind === 'row_count') return ['count']
  if (metricKind === 'derived') return ['sum', 'average', 'count', 'minimum', 'maximum']
  if (!column) return []
  if (column.inferredType === 'Integer' || column.inferredType === 'Decimal')
    return ['sum', 'average', 'count', 'count_distinct', 'minimum', 'maximum']
  if (column.inferredType === 'Date') return ['count', 'count_distinct', 'minimum', 'maximum']
  return ['count', 'count_distinct']
}

function selectedColumns(values: AnalysisFormValues) {
  const selected = new Set<string>()
  if (values.metricKind === 'column' && values.metricColumn) selected.add(values.metricColumn)
  if (values.metricKind === 'derived') {
    if (values.leftColumn) selected.add(values.leftColumn)
    if (values.rightColumn) selected.add(values.rightColumn)
  }
  values.groupBy.filter(Boolean).forEach((key) => selected.add(key))
  values.filters.forEach((filter) => {
    if (filter.column) selected.add(filter.column)
  })
  if (values.sortTarget.startsWith('group:')) selected.add(values.sortTarget.slice(6))
  return [...selected]
}

function isValueOperator(operator: string) {
  return !['is_missing', 'is_not_missing', 'is_true', 'is_false'].includes(operator)
}

export function validateAnalysis(
  values: AnalysisFormValues,
  dataset: ActiveDataset,
  report: DataQualityReport,
) {
  const errors: Array<{ field: string; message: string }> = []
  if (!values.question.trim())
    errors.push({ field: 'question', message: 'Enter one analytical question.' })
  if (values.question.length > 1000)
    errors.push({ field: 'question', message: 'Question must be 1,000 characters or fewer.' })
  const byKey = new Map(dataset.headers.map((column) => [column.key, column]))
  const numeric = (key: string) =>
    ['Integer', 'Decimal'].includes(byKey.get(key)?.inferredType ?? '')
  if (!values.metricKind) errors.push({ field: 'metricKind', message: 'Select a metric type.' })
  if (values.metricKind === 'column' && !byKey.has(values.metricColumn))
    errors.push({ field: 'metricColumn', message: 'Select a real dataset column.' })
  if (values.metricKind === 'derived') {
    if (!numeric(values.leftColumn) || !numeric(values.rightColumn))
      errors.push({ field: 'leftColumn', message: 'Derived metrics require two numeric columns.' })
    if (!values.derivedDisplayName.trim())
      errors.push({
        field: 'derivedDisplayName',
        message: 'Enter a display name for the derived metric.',
      })
  }
  const allowed = compatibleAggregations(values.metricKind, byKey.get(values.metricColumn))
  if (!values.aggregation || !allowed.includes(values.aggregation))
    errors.push({
      field: 'aggregation',
      message: 'Choose an aggregation compatible with the metric.',
    })
  const groups = values.groupBy.filter(Boolean)
  if (new Set(groups).size !== groups.length)
    errors.push({ field: 'groupBy', message: 'Choose different group-by columns.' })
  values.filters.forEach((filter, index) => {
    const column = byKey.get(filter.column)
    const operators = column
      ? filterOperators(column.inferredType, filter.interpretMixedAsText)
      : []
    if (!column || !operators.includes(filter.operator))
      errors.push({
        field: `filters.${index}.operator`,
        message: `Filter ${index + 1} has an invalid column or operator.`,
      })
    if (isValueOperator(filter.operator) && !filter.value?.trim())
      errors.push({
        field: `filters.${index}.value`,
        message: `Filter ${index + 1} needs a value.`,
      })
    if (filter.operator === 'between' && !filter.secondValue?.trim())
      errors.push({
        field: `filters.${index}.secondValue`,
        message: `Filter ${index + 1} needs an upper value.`,
      })
  })
  const sortOptions = ['metric', ...groups.map((key) => `group:${key}`)]
  if (!sortOptions.includes(values.sortTarget))
    errors.push({
      field: 'sortTarget',
      message: 'Sort by the computed metric or a selected group.',
    })
  const required = selectedColumns(values)
  const selectedQuality = report.columns.filter((column) => required.includes(column.key))
  if (selectedQuality.some((column) => column.missingCount > 0) && !values.confirmMissingExclude)
    errors.push({
      field: 'confirmMissingExclude',
      message: 'Choose how selected-column missing values are handled.',
    })
  if (report.duplicateCount > 0 && !values.confirmDuplicateKeep)
    errors.push({ field: 'confirmDuplicateKeep', message: 'Confirm duplicate-row handling.' })
  if (
    selectedQuality.some((column) => column.ambiguousDateRows.length > 0) &&
    !values.dateInterpretation
  )
    errors.push({
      field: 'dateInterpretation',
      message: 'Choose an interpretation for ambiguous dates.',
    })
  if (
    values.metricKind === 'derived' &&
    values.arithmeticOperator === 'divide' &&
    !values.divisionHandling
  )
    errors.push({ field: 'divisionHandling', message: 'Choose division-by-zero handling.' })
  return errors
}

export function createSpecification(
  values: AnalysisFormValues,
  dataset: ActiveDataset,
): AnalysisSpecification {
  let metric: AnalysisMetric
  if (values.metricKind === 'row_count') metric = { kind: 'row_count' }
  else if (values.metricKind === 'derived')
    metric = {
      kind: 'derived',
      leftColumn: values.leftColumn,
      operator: values.arithmeticOperator,
      rightColumn: values.rightColumn,
      displayName: values.derivedDisplayName.trim(),
    }
  else metric = { kind: 'column', column: values.metricColumn }
  const groupBy = values.groupBy.filter(Boolean)
  const assumptions: string[] = []
  if (values.confirmMissingExclude)
    assumptions.push('Exclude rows with missing values in selected columns.')
  if (values.confirmDuplicateKeep)
    assumptions.push('Keep exact duplicate rows in the analysis input.')
  if (values.dateInterpretation)
    assumptions.push(
      values.dateInterpretation === 'day_first'
        ? 'Interpret ambiguous dates as day first.'
        : 'Interpret ambiguous dates as month first.',
    )
  if (values.divisionHandling)
    assumptions.push(
      values.divisionHandling === 'exclude'
        ? 'Exclude rows where the divisor is zero.'
        : 'Return null when the divisor is zero.',
    )
  values.filters
    .filter((filter) => filter.interpretMixedAsText)
    .forEach((filter) => assumptions.push(`Interpret ${filter.column} as text for filtering.`))
  return {
    version: '1.0',
    datasetId: dataset.datasetId,
    question: values.question.trim(),
    metric,
    aggregation: values.aggregation as Aggregation,
    groupBy,
    filters: values.filters,
    sort: { target: values.sortTarget, direction: values.sortDirection },
    limit: groupBy.length ? values.limit : 1,
    requiredColumns: selectedColumns(values),
    assumptions,
    createdAt: new Date().toISOString(),
  }
}

export function buildProofContract(
  values: AnalysisFormValues,
  dataset: ActiveDataset,
  report: DataQualityReport,
): ProofContractItem[] {
  const selected = selectedColumns(values)
  const quality = report.columns.filter((column) => selected.includes(column.key))
  const items: ProofContractItem[] = [
    {
      id: 'columns',
      requirement: 'Required columns must exist in the active dataset.',
      state: selected.every((key) => dataset.headers.some((column) => column.key === key))
        ? 'satisfied'
        : 'blocking',
    },
    {
      id: 'agreement',
      requirement: 'Future SQL and Polars results must agree before an answer is released.',
      state: 'backend_decision',
    },
  ]
  const numericQuality = quality.filter((column) =>
    ['Integer', 'Decimal'].includes(column.inferredType),
  )
  if (numericQuality.length) {
    items.push({
      id: 'numeric-values',
      requirement: 'Selected numeric columns must contain usable numeric values.',
      state: numericQuality.some((column) => column.invalidNumericCount > 0)
        ? 'backend_decision'
        : 'satisfied',
    })
  }
  if (quality.some((column) => column.missingCount > 0))
    items.push({
      id: 'missing',
      requirement: 'Missing-value handling must be defined for selected columns.',
      state: values.confirmMissingExclude ? 'satisfied' : 'user_clarification',
    })
  if (report.duplicateCount > 0)
    items.push({
      id: 'duplicates',
      requirement: 'Exact duplicate-row handling must be confirmed.',
      state: values.confirmDuplicateKeep ? 'satisfied' : 'user_clarification',
    })
  if (quality.some((column) => column.currencies.length > 1))
    items.push({
      id: 'currency',
      requirement:
        'Currency normalization is required for selected columns with multiple currencies.',
      state: 'backend_decision',
    })
  if (quality.some((column) => column.ambiguousDateRows.length > 0))
    items.push({
      id: 'dates',
      requirement: 'Ambiguous date interpretation must be defined.',
      state: values.dateInterpretation ? 'satisfied' : 'user_clarification',
    })
  if (values.metricKind === 'derived' && values.arithmeticOperator === 'divide')
    items.push({
      id: 'division',
      requirement: 'Division-by-zero handling must be defined.',
      state: values.divisionHandling ? 'satisfied' : 'user_clarification',
    })
  return items
}
