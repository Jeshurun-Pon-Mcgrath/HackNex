import { AlertCircle, FileSpreadsheet, FileText, Upload, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { PreparedWorkbook } from '../../lib/parsers'
import { parseCsvFile, parseWorkbookSheet, prepareWorkbook } from '../../lib/parsers'
import { formatFileSize, validateDatasetFile } from '../../lib/fileValidation'
import { useDatasetStore } from '../../store/datasetStore'
import type { UploadedFileMetadata } from '../../types/dataset'
import { Button } from '../ui/Button'

type PendingFile = { file: File; metadata: UploadedFileMetadata }

export function FileUpload({ compact = false }: { compact?: boolean }) {
  const inputId = useId()
  const instructionsId = `${inputId}-instructions`
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const operationRef = useRef(0)
  const [pending, setPending] = useState<PendingFile | null>(null)
  const [preparedWorkbook, setPreparedWorkbook] = useState<PreparedWorkbook | null>(null)
  const [selectedSheet, setSelectedSheet] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const { analysisStatus, error, setReading, setDataset, setError } = useDatasetStore()
  const isReading = analysisStatus === 'reading'

  function clearLocalSelection() {
    setPending(null)
    setPreparedWorkbook(null)
    setSelectedSheet('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function selectFile(file: File | null) {
    const validation = validateDatasetFile(file)
    setPreparedWorkbook(null)
    setSelectedSheet('')
    if (!validation.valid) {
      setPending(null)
      setError(validation.message)
      return
    }
    setPending({ file: file!, metadata: validation.metadata })
    useDatasetStore.setState({ analysisStatus: 'idle', error: null })
  }

  function cancelSelection() {
    operationRef.current += 1
    clearLocalSelection()
    useDatasetStore.setState({ analysisStatus: 'idle', error: null })
  }

  async function processPending() {
    if (!pending || isReading) return
    const operation = ++operationRef.current
    setReading()
    try {
      if (pending.metadata.type === 'csv') {
        const dataset = await parseCsvFile(pending.file, pending.metadata)
        if (operation === operationRef.current) {
          setDataset(dataset)
          clearLocalSelection()
        }
        return
      }
      const workbook = await prepareWorkbook(pending.file, pending.metadata)
      if (operation !== operationRef.current) return
      if (workbook.sheets.length === 1) {
        setDataset(parseWorkbookSheet(workbook, workbook.sheets[0].name))
        clearLocalSelection()
      } else {
        setPreparedWorkbook(workbook)
        useDatasetStore.setState({ analysisStatus: 'idle', error: null })
      }
    } catch {
      if (operation === operationRef.current)
        setError('The file could not be parsed. Check its structure and try again.')
    }
  }

  function inspectSheet() {
    if (!preparedWorkbook || !selectedSheet) {
      setError('Choose a worksheet to inspect.')
      return
    }
    setReading()
    try {
      setDataset(parseWorkbookSheet(preparedWorkbook, selectedSheet))
      clearLocalSelection()
    } catch {
      setError('The selected worksheet could not be parsed. Choose another worksheet or file.')
    }
  }

  const describedBy = [instructionsId, error ? errorId : ''].filter(Boolean).join(' ')
  return (
    <section
      className={`upload-section ${compact ? 'upload-section--compact' : ''}`}
      aria-labelledby={`${inputId}-title`}
    >
      {!compact && <h2 id={`${inputId}-title`}>Add a dataset</h2>}
      <div
        className={`upload-panel ${dragActive ? 'upload-panel--active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!isReading) setDragActive(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          if (!isReading) selectFile(event.dataTransfer.files[0] ?? null)
        }}
      >
        <Upload size={26} aria-hidden="true" />
        <div>
          <p className="upload-panel__title">Choose a CSV or XLSX file to inspect locally.</p>
          <p id={instructionsId} className="help-text">
            Supported files: .csv and .xlsx. Maximum size: 20 MB. Your file remains in memory for
            this browser session and may be cleared on reload.
          </p>
        </div>
        <label className="button button--secondary" htmlFor={inputId}>
          Choose file
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="file-input"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          disabled={isReading}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {error && (
        <div id={errorId} className="upload-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {pending && (
        <div className="pending-file">
          {pending.metadata.type === 'csv' ? (
            <FileText aria-hidden="true" />
          ) : (
            <FileSpreadsheet aria-hidden="true" />
          )}
          <div>
            <strong>{pending.metadata.name}</strong>
            <span>
              {formatFileSize(pending.metadata.size)} · {pending.metadata.type.toUpperCase()}
            </span>
          </div>
          {!preparedWorkbook && (
            <Button onClick={() => void processPending()} isLoading={isReading}>
              {isReading ? 'Reading dataset' : 'Process file'}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={isReading}
          >
            Choose different
          </Button>
          <button
            className="icon-button"
            aria-label="Cancel file selection"
            title="Cancel file selection"
            onClick={cancelSelection}
            disabled={isReading}
          >
            <X size={20} />
          </button>
        </div>
      )}
      {isReading && (
        <div className="reading-state" role="status">
          <span className="progress-indicator" aria-hidden="true" />
          Reading dataset
        </div>
      )}
      {preparedWorkbook && (
        <div className="sheet-picker">
          <label htmlFor={`${inputId}-sheet`}>Choose a worksheet</label>
          <select
            id={`${inputId}-sheet`}
            value={selectedSheet}
            onChange={(event) => setSelectedSheet(event.target.value)}
          >
            <option value="">Select a worksheet</option>
            {preparedWorkbook.sheets.map((sheet) => (
              <option key={sheet.index} value={sheet.name}>
                {sheet.name}
              </option>
            ))}
          </select>
          <Button onClick={inspectSheet} disabled={!selectedSheet}>
            Inspect worksheet
          </Button>
          <p className="help-text">
            Worksheets are inspected separately and are never combined automatically.
          </p>
        </div>
      )}
    </section>
  )
}
