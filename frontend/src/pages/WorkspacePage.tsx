import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataPreviewTable } from '../components/dataset/DataPreviewTable'
import { DatasetSummary } from '../components/dataset/DatasetSummary'
import { FileUpload } from '../components/dataset/FileUpload'
import { Button } from '../components/ui/Button'
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'
import { useDatasetStore } from '../store/datasetStore'

export function WorkspacePage() {
  const dataset = useDatasetStore((state) => state.activeDataset)
  const clearDataset = useDatasetStore((state) => state.clearDataset)
  const [showReplace, setShowReplace] = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const removeButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="page-container">
      <PageHeader
        title="Data Workspace"
        description="Load one CSV or XLSX dataset for local inspection and preview."
      />
      <div className="session-note">
        <StatusMessage>
          Your dataset is held in memory only for this browser session. Reloading the page may clear
          it.
        </StatusMessage>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {dataset
          ? `${dataset.fileName} loaded with ${dataset.rowCount} rows and ${dataset.columnCount} columns.`
          : 'No dataset is loaded.'}
      </p>
      {!dataset ? (
        <FileUpload />
      ) : (
        <>
          <DatasetSummary dataset={dataset} />
          <div className="dataset-actions">
            <Button variant="secondary" onClick={() => setShowReplace((value) => !value)}>
              Replace dataset
            </Button>
            <Button variant="secondary" ref={removeButtonRef} onClick={() => setShowRemove(true)}>
              Remove dataset
            </Button>
            <Link className="button button--primary" to="/data-quality">
              Open Data Quality
            </Link>
          </div>
          {showReplace && <FileUpload compact />}
          {dataset.parseWarnings.length > 0 && (
            <section className="warning-list" aria-labelledby="warning-title">
              <h2 id="warning-title">Parse warnings</h2>
              <ul>
                {dataset.parseWarnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </section>
          )}
          <DataPreviewTable dataset={dataset} />
        </>
      )}
      <ConfirmationDialog
        open={showRemove}
        title="Remove active dataset?"
        description="This clears the parsed rows, metadata, and quality findings from memory. This action cannot be undone."
        confirmLabel="Remove dataset"
        returnFocusRef={removeButtonRef}
        onClose={() => setShowRemove(false)}
        onConfirm={() => {
          clearDataset()
          setShowRemove(false)
        }}
      />
    </div>
  )
}
