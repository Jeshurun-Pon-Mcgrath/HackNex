import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { WorkBook, WorkSheet } from 'xlsx'
import { activeDatasetSchema } from './datasetSchema'
import { withInferredTypes } from './quality'
import type {
  ActiveDataset,
  CellValue,
  DatasetColumn,
  ParseWarning,
  ParsedRow,
  UploadedFileMetadata,
  WorkbookSheetMetadata,
} from '../types/dataset'

export type PreparedWorkbook = {
  workbook: WorkBook
  sheets: WorkbookSheetMetadata[]
  metadata: UploadedFileMetadata
}

function datasetId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `dataset-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (value instanceof Date) return value.toISOString()
  return null
}

function toDisplayString(value: unknown) {
  const cellValue = toCellValue(value)
  return cellValue === null ? '' : String(cellValue)
}

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || toDisplayString(value).trim() === ''
}

function trimTrailingEmptyRows(rows: unknown[][]) {
  const trimmed = [...rows]
  while (trimmed.length && trimmed[trimmed.length - 1].every(isEmptyValue)) trimmed.pop()
  return trimmed
}

function buildRows(matrix: unknown[][]) {
  const firstValidRow = matrix.findIndex((row) => row.some((value) => !isEmptyValue(value)))
  if (firstValidRow < 0) throw new Error('The file does not contain a readable header row.')
  const data = trimTrailingEmptyRows(matrix.slice(firstValidRow))
  const rawHeaders = data[0].map(toDisplayString)
  const widestRow = Math.max(rawHeaders.length, ...data.slice(1).map((row) => row.length))
  while (rawHeaders.length < widestRow) rawHeaders.push('')
  const headers: DatasetColumn[] = rawHeaders.map((header, position) => ({
    key: `column_${position + 1}`,
    header,
    position,
    inferredType: 'Empty',
  }))
  const warnings = headerWarnings(headers)
  const rows: ParsedRow[] = data
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map(({ key, position }) => [key, toCellValue(values[position])])),
    )
  return { headers: withInferredTypes(headers, rows), rows, warnings }
}

function headerWarnings(headers: DatasetColumn[]): ParseWarning[] {
  const warnings: ParseWarning[] = []
  const exact = new Map<string, number>()
  headers.forEach((header) => {
    const displayColumn = header.position + 1
    if (!header.header.trim())
      warnings.push({
        code: 'BLANK_HEADER',
        message: `Column ${displayColumn} has a blank header.`,
        column: displayColumn,
      })
    if (header.header !== header.header.trim())
      warnings.push({
        code: 'HEADER_WHITESPACE',
        message: `Column ${displayColumn} has leading or trailing whitespace in its header.`,
        column: displayColumn,
      })
    exact.set(header.header, (exact.get(header.header) ?? 0) + 1)
  })
  for (const [header, count] of exact) {
    if (header.trim() && count > 1)
      warnings.push({
        code: 'DUPLICATE_HEADER',
        message: `The header "${header}" appears ${count} times. Internal column keys remain distinct.`,
      })
  }
  return warnings
}

function finishDataset(
  metadata: UploadedFileMetadata,
  headers: DatasetColumn[],
  rows: ParsedRow[],
  warnings: ParseWarning[],
  selectedSheet: string | null,
  availableSheets: WorkbookSheetMetadata[],
): ActiveDataset {
  return activeDatasetSchema.parse({
    datasetId: datasetId(),
    fileName: metadata.name,
    fileType: metadata.type,
    fileSize: metadata.size,
    selectedSheet,
    availableSheets,
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
    parseWarnings: warnings,
    loadedAt: new Date().toISOString(),
  })
}

export function parseCsvText(text: string, metadata: UploadedFileMetadata): ActiveDataset {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false,
  })
  if (!result.data.length) throw new Error('The CSV does not contain readable data.')
  const matrix = result.data as unknown[][]
  const { headers, rows, warnings } = buildRows(matrix)
  const parserWarnings: ParseWarning[] = result.errors.map((error) => ({
    code: error.code,
    message: `CSV parser issue${error.row === undefined ? '' : ` near row ${error.row + 1}`}: ${error.message}`,
    row: error.row === undefined ? undefined : error.row + 1,
  }))
  if (
    !result.meta.delimiter ||
    result.errors.some((error) => error.code === 'UndetectableDelimiter')
  ) {
    parserWarnings.push({
      code: 'DELIMITER_UNCERTAIN',
      message:
        'The CSV delimiter could not be identified with confidence. Review the preview before continuing.',
    })
  }
  return finishDataset(metadata, headers, rows, [...warnings, ...parserWarnings], null, [])
}

export async function parseCsvFile(file: File, metadata: UploadedFileMetadata) {
  const text = await file.text()
  return parseCsvText(text, metadata)
}

export async function prepareWorkbook(
  file: File,
  metadata: UploadedFileMetadata,
): Promise<PreparedWorkbook> {
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      bookVBA: false,
      bookFiles: false,
    })
    const sheets = workbook.SheetNames.map((name, index) => ({ name, index }))
    if (!sheets.length) throw new Error('No worksheets found')
    return { workbook, sheets, metadata }
  } catch {
    throw new Error(
      'The workbook could not be parsed. Check that it is a valid, unprotected XLSX file and try again.',
    )
  }
}

function containsFormulas(sheet: WorkSheet) {
  return Object.entries(sheet).some(
    ([address, cell]) =>
      !address.startsWith('!') &&
      typeof cell === 'object' &&
      cell !== null &&
      'f' in cell &&
      Boolean((cell as XLSX.CellObject).f),
  )
}

export function parseWorkbookSheet(prepared: PreparedWorkbook, sheetName: string): ActiveDataset {
  if (!prepared.sheets.some(({ name }) => name === sheetName))
    throw new Error('Choose an available worksheet to continue.')
  const sheet = prepared.workbook.Sheets[sheetName]
  if (!sheet) throw new Error('The selected worksheet could not be read. Choose another worksheet.')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  })
  const { headers, rows, warnings } = buildRows(matrix)
  if (containsFormulas(sheet))
    warnings.push({
      code: 'FORMULAS_PRESENT',
      message:
        'This worksheet contains formulas. Zynex displays values supplied by the workbook and does not execute formulas.',
    })
  return finishDataset(prepared.metadata, headers, rows, warnings, sheetName, prepared.sheets)
}
