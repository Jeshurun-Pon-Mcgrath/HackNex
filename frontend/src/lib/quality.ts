import type {
  ActiveDataset,
  CellValue,
  ColumnQuality,
  DataQualityReport,
  DatasetColumn,
  InferredDataType,
  OutlierDetail,
  ParsedRow,
  QualityFinding,
} from '../types/dataset'

export function isMissing(value: CellValue | undefined) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

const integerPattern = /^[+-]?\d+$/
const decimalPattern = /^[+-]?(?:\d+\.\d+|\d+\.|\.\d+)$/
const isoDatePattern =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const yearFirstSlashPattern = /^\d{4}\/\d{1,2}\/\d{1,2}$/
const shortDatePattern = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

function classifyValue(value: CellValue): InferredDataType {
  if (isMissing(value)) return 'Empty'
  if (typeof value === 'boolean') return 'Boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'Integer' : 'Decimal'
  const text = String(value).trim()
  if (/^(true|false)$/i.test(text)) return 'Boolean'
  if (integerPattern.test(text)) return 'Integer'
  if (decimalPattern.test(text)) return 'Decimal'
  if (isoDatePattern.test(text) || yearFirstSlashPattern.test(text) || shortDatePattern.test(text))
    return 'Date'
  return 'Text'
}

export function inferDataType(values: CellValue[]): InferredDataType {
  const present = values.filter((value) => !isMissing(value))
  if (present.length === 0) return 'Empty'
  const types = present.map(classifyValue)
  const unique = new Set(types)
  if (unique.size === 1) return types[0]
  if ([...unique].every((type) => type === 'Integer' || type === 'Decimal')) return 'Decimal'
  const numericCount = types.filter((type) => type === 'Integer' || type === 'Decimal').length
  if (numericCount / types.length >= 0.8) {
    return types.includes('Decimal') ? 'Decimal' : 'Integer'
  }
  return 'Mixed'
}

function numericValue(value: CellValue) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!integerPattern.test(trimmed) && !decimalPattern.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function dateInformation(value: CellValue) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (isoDatePattern.test(text)) return { format: 'ISO 8601', ambiguous: false }
  if (yearFirstSlashPattern.test(text)) return { format: 'YYYY/MM/DD', ambiguous: false }
  const short = shortDatePattern.exec(text)
  if (!short) return null
  const first = Number(short[1])
  const second = Number(short[2])
  if (first <= 12 && second <= 12) return { format: 'Ambiguous day/month', ambiguous: true }
  return { format: first > 12 ? 'DD/MM/YYYY' : 'MM/DD/YYYY', ambiguous: false }
}

const currencySymbols: Array<[RegExp, string]> = [
  [/\$/g, '$'],
  [/€/g, 'EUR symbol'],
  [/£/g, 'GBP symbol'],
  [/¥/g, 'JPY/CNY symbol'],
  [/₹/g, 'INR symbol'],
]
const currencyCodePattern = /\b(USD|EUR|GBP|JPY|CNY|INR|AUD|CAD|CHF|NZD)\b/gi

function detectCurrencies(value: CellValue) {
  if (typeof value !== 'string') return []
  const found = new Set<string>()
  for (const [pattern, label] of currencySymbols) {
    pattern.lastIndex = 0
    if (pattern.test(value)) found.add(label)
  }
  for (const match of value.matchAll(currencyCodePattern)) found.add(match[1].toUpperCase())
  return [...found]
}

function percentile(sorted: number[], percentileValue: number) {
  const index = (sorted.length - 1) * percentileValue
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function calculateOutlier(column: DatasetColumn, rows: ParsedRow[]): OutlierDetail | null {
  const values = rows
    .map((row, index) => ({ value: numericValue(row[column.key]), index: index + 1 }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)
  if (values.length < 4) return null
  const sorted = values.map(({ value }) => value).sort((a, b) => a - b)
  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  const rowIndices = values
    .filter(({ value }) => value < lowerBound || value > upperBound)
    .map(({ index }) => index)
  return {
    columnKey: column.key,
    header: column.header,
    q1,
    q3,
    iqr,
    lowerBound,
    upperBound,
    outlierCount: rowIndices.length,
    rowIndices,
  }
}

function normalizedRow(row: ParsedRow, headers: DatasetColumn[]) {
  return JSON.stringify(
    headers.map(({ key }) => {
      const value = row[key]
      if (value === null || value === undefined) return ['missing']
      if (typeof value === 'string') return ['string', value.trim()]
      return [typeof value, value]
    }),
  )
}

function headerFindings(headers: DatasetColumn[]): QualityFinding[] {
  const findings: QualityFinding[] = []
  const exact = new Map<string, number>()
  const caseInsensitive = new Map<string, string>()
  for (const header of headers) {
    if (header.header.trim() === '') {
      findings.push({
        id: `header-blank-${header.key}`,
        check: 'Header quality',
        severity: 'warning',
        message: `Column ${header.position + 1} has a blank header.`,
        columnKey: header.key,
      })
    }
    if (header.header !== header.header.trim()) {
      findings.push({
        id: `header-space-${header.key}`,
        check: 'Header quality',
        severity: 'warning',
        message: `Header "${header.header}" has leading or trailing whitespace.`,
        columnKey: header.key,
      })
    }
    exact.set(header.header, (exact.get(header.header) ?? 0) + 1)
    const lower = header.header.toLocaleLowerCase()
    const prior = caseInsensitive.get(lower)
    if (prior !== undefined && prior !== header.header) {
      findings.push({
        id: `header-case-${header.key}`,
        check: 'Header quality',
        severity: 'warning',
        message: `Header "${header.header}" differs from "${prior}" only by letter case.`,
        columnKey: header.key,
      })
    } else caseInsensitive.set(lower, header.header)
  }
  for (const [header, count] of exact) {
    if (header !== '' && count > 1)
      findings.push({
        id: `header-duplicate-${header}`,
        check: 'Header quality',
        severity: 'warning',
        message: `Header "${header}" appears ${count} times.`,
      })
  }
  if (findings.length === 0)
    findings.push({
      id: 'header-passed',
      check: 'Header quality',
      severity: 'passed',
      message: 'No header quality issues were detected.',
    })
  return findings
}

export function buildQualityReport(dataset: ActiveDataset): DataQualityReport {
  const findings: QualityFinding[] = [...headerFindings(dataset.headers)]
  const columns: ColumnQuality[] = dataset.headers.map((column) => {
    const values = dataset.rows.map((row) => row[column.key])
    const missingRows = values.flatMap((value, index) => (isMissing(value) ? [index + 1] : []))
    const present = values.filter((value) => !isMissing(value))
    const numericCount = present.filter((value) => numericValue(value) !== null).length
    const mostlyNumeric = present.length > 0 && numericCount / present.length >= 0.8
    const invalidNumericRows = mostlyNumeric
      ? values.flatMap((value, index) =>
          !isMissing(value) && numericValue(value) === null ? [index + 1] : [],
        )
      : []
    const dateDetails = values.map(dateInformation)
    const dateFormats = [
      ...new Set(dateDetails.flatMap((detail) => (detail ? [detail.format] : []))),
    ]
    const ambiguousDateRows = dateDetails.flatMap((detail, index) =>
      detail?.ambiguous ? [index + 1] : [],
    )
    const currencies = [...new Set(values.flatMap(detectCurrencies))]
    const columnQuality: ColumnQuality = {
      key: column.key,
      header: column.header,
      inferredType: column.inferredType,
      missingCount: missingRows.length,
      missingPercentage: dataset.rowCount === 0 ? 0 : (missingRows.length / dataset.rowCount) * 100,
      invalidNumericCount: invalidNumericRows.length,
      invalidNumericRows,
      dateFormats,
      ambiguousDateRows,
      currencies,
    }
    const label = column.header || `Column ${column.position + 1}`
    findings.push({
      id: `missing-${column.key}`,
      check: 'Missing values',
      severity: missingRows.length ? 'information' : 'passed',
      message: missingRows.length
        ? `${label} contains ${missingRows.length} missing ${missingRows.length === 1 ? 'value' : 'values'} (${columnQuality.missingPercentage.toFixed(1)}%).`
        : `${label} contains no missing values.`,
      columnKey: column.key,
      rowIndices: missingRows,
    })
    if (invalidNumericRows.length)
      findings.push({
        id: `numeric-${column.key}`,
        check: 'Invalid numeric values',
        severity: 'warning',
        message: `${label} is mostly numeric but contains ${invalidNumericRows.length} incompatible ${invalidNumericRows.length === 1 ? 'value' : 'values'}.`,
        columnKey: column.key,
        rowIndices: invalidNumericRows,
      })
    if (ambiguousDateRows.length || dateFormats.length > 1)
      findings.push({
        id: `date-${column.key}`,
        check: 'Date consistency',
        severity: 'warning',
        message: `${label} contains ${ambiguousDateRows.length ? 'ambiguous or ' : ''}mixed date formats. Locale was not inferred.`,
        columnKey: column.key,
        rowIndices: ambiguousDateRows,
      })
    if (currencies.length > 1)
      findings.push({
        id: `currency-${column.key}`,
        check: 'Currency consistency',
        severity: 'warning',
        message: `${label} contains multiple explicit currency markers: ${currencies.join(', ')}.`,
        columnKey: column.key,
      })
    return columnQuality
  })

  const seen = new Map<string, number>()
  const duplicateRowIndices: number[] = []
  dataset.rows.forEach((row, index) => {
    const normalized = normalizedRow(row, dataset.headers)
    if (seen.has(normalized)) duplicateRowIndices.push(index + 1)
    else seen.set(normalized, index + 1)
  })
  findings.push({
    id: 'duplicates',
    check: 'Duplicate rows',
    severity: duplicateRowIndices.length ? 'warning' : 'passed',
    message: duplicateRowIndices.length
      ? `${duplicateRowIndices.length} exact duplicate ${duplicateRowIndices.length === 1 ? 'row was' : 'rows were'} detected beyond the first occurrence.`
      : 'No exact duplicate rows were detected.',
    rowIndices: duplicateRowIndices,
  })

  const outliers = dataset.headers
    .filter((column) => column.inferredType === 'Integer' || column.inferredType === 'Decimal')
    .map((column) => calculateOutlier(column, dataset.rows))
    .filter((detail): detail is OutlierDetail => detail !== null)
  for (const detail of outliers) {
    findings.push({
      id: `outlier-${detail.columnKey}`,
      check: 'Numeric outliers',
      severity: detail.outlierCount ? 'information' : 'passed',
      message: detail.outlierCount
        ? `${detail.header || 'Unnamed column'} contains ${detail.outlierCount} IQR ${detail.outlierCount === 1 ? 'outlier' : 'outliers'} requiring review.`
        : `${detail.header || 'Unnamed column'} contains no IQR outliers.`,
      columnKey: detail.columnKey,
      rowIndices: detail.rowIndices,
    })
  }

  const summary = { error: 0, warning: 0, information: 0, passed: 0 }
  for (const finding of findings) summary[finding.severity] += 1
  return {
    scannedAt: new Date().toISOString(),
    findings,
    columns,
    duplicateCount: duplicateRowIndices.length,
    duplicateRowIndices,
    outliers,
    summary,
  }
}

export function withInferredTypes(headers: DatasetColumn[], rows: ParsedRow[]) {
  return headers.map((header) => ({
    ...header,
    inferredType: inferDataType(rows.map((row) => row[header.key])),
  }))
}
