export type FileType = 'csv' | 'xlsx'
export type CellValue = string | number | boolean | null
export type ParsedRow = Record<string, CellValue>
export type AnalysisStatus = 'idle' | 'reading' | 'ready' | 'error'
export type InferredDataType =
  'Integer' | 'Decimal' | 'Boolean' | 'Date' | 'Text' | 'Empty' | 'Mixed'
export type FindingSeverity = 'error' | 'warning' | 'information' | 'passed'

export type UploadedFileMetadata = {
  name: string
  type: FileType
  size: number
  mimeType: string
  lastModified: number
}

export type WorkbookSheetMetadata = {
  name: string
  index: number
}

export type DatasetColumn = {
  key: string
  header: string
  position: number
  inferredType: InferredDataType
}

export type ParseWarning = {
  code: string
  message: string
  row?: number
  column?: number
}

export type QualityFinding = {
  id: string
  check: string
  severity: FindingSeverity
  message: string
  columnKey?: string
  rowIndices?: number[]
}

export type ColumnQuality = {
  key: string
  header: string
  inferredType: InferredDataType
  missingCount: number
  missingPercentage: number
  invalidNumericCount: number
  invalidNumericRows: number[]
  dateFormats: string[]
  ambiguousDateRows: number[]
  currencies: string[]
}

export type OutlierDetail = {
  columnKey: string
  header: string
  q1: number
  q3: number
  iqr: number
  lowerBound: number
  upperBound: number
  outlierCount: number
  rowIndices: number[]
}

export type DataQualityReport = {
  scannedAt: string
  findings: QualityFinding[]
  columns: ColumnQuality[]
  duplicateCount: number
  duplicateRowIndices: number[]
  outliers: OutlierDetail[]
  summary: {
    error: number
    warning: number
    information: number
    passed: number
  }
}

export type ActiveDataset = {
  datasetId: string
  fileName: string
  fileType: FileType
  fileSize: number
  selectedSheet: string | null
  availableSheets: WorkbookSheetMetadata[]
  headers: DatasetColumn[]
  rows: ParsedRow[]
  rowCount: number
  columnCount: number
  parseWarnings: ParseWarning[]
  loadedAt: string
}

export type DatasetStoreState = {
  activeDataset: ActiveDataset | null
  qualityReport: DataQualityReport | null
  analysisStatus: AnalysisStatus
  error: string | null
}
