import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DatasetSummary } from '../components/dataset/DatasetSummary'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { useDatasetStore } from '../store/datasetStore'
import type { FindingSeverity } from '../types/dataset'

const severityDetails = {
  error: { label: 'Error', icon: AlertCircle },
  warning: { label: 'Warning', icon: TriangleAlert },
  information: { label: 'Information', icon: Info },
  passed: { label: 'Passed', icon: CheckCircle2 },
} satisfies Record<FindingSeverity, { label: string; icon: typeof Info }>

function number(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

export function DataQualityPage() {
  const dataset = useDatasetStore((state) => state.activeDataset)
  const report = useDatasetStore((state) => state.qualityReport)
  if (!dataset || !report) {
    return (
      <div className="page-container">
        <PageHeader
          title="Data Quality"
          description="Review deterministic quality checks for the active dataset."
        />
        <EmptyState
          title="No dataset is available"
          description="Add a CSV or XLSX file in Data Workspace before running quality checks."
        />
        <Link className="button button--primary empty-state-link" to="/workspace">
          Return to Workspace
        </Link>
      </div>
    )
  }
  return (
    <div className="page-container quality-page">
      <PageHeader
        title="Data Quality"
        description="Review deterministic checks calculated from the active dataset. No overall quality score is assigned."
      />
      <DatasetSummary dataset={dataset} />
      <div className="scan-meta">
        <span>Scan completed {new Date(report.scannedAt).toLocaleString()}</span>
        <Link className="button button--secondary" to="/workspace">
          Return to Workspace
        </Link>
      </div>
      <section aria-labelledby="quality-summary-title">
        <h2 id="quality-summary-title">Finding summary</h2>
        <dl className="quality-summary">
          {(Object.keys(severityDetails) as FindingSeverity[]).map((severity) => {
            const detail = severityDetails[severity]
            const Icon = detail.icon
            return (
              <div key={severity} className={`quality-summary__item severity--${severity}`}>
                <dt>
                  <Icon size={18} aria-hidden="true" />
                  {detail.label}
                </dt>
                <dd>{report.summary[severity]}</dd>
              </div>
            )
          })}
        </dl>
      </section>
      <section aria-labelledby="findings-title">
        <h2 id="findings-title">Findings</h2>
        <div className="table-scroll" tabIndex={0} aria-label="Scrollable quality findings">
          <table className="quality-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Check</th>
                <th scope="col">Finding</th>
                <th scope="col">Affected rows</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding) => {
                const detail = severityDetails[finding.severity]
                const Icon = detail.icon
                return (
                  <tr key={finding.id}>
                    <td>
                      <span className={`severity severity--${finding.severity}`}>
                        <Icon size={17} aria-hidden="true" />
                        {detail.label}
                      </span>
                    </td>
                    <td>{finding.check}</td>
                    <td>{finding.message}</td>
                    <td>{finding.rowIndices?.length ? finding.rowIndices.join(', ') : 'None'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="columns-title">
        <h2 id="columns-title">Column details</h2>
        <div className="table-scroll" tabIndex={0} aria-label="Scrollable column quality details">
          <table className="quality-table">
            <thead>
              <tr>
                <th scope="col">Column</th>
                <th scope="col">Type</th>
                <th scope="col">Missing</th>
                <th scope="col">Invalid numeric</th>
                <th scope="col">Date formats</th>
                <th scope="col">Currencies</th>
              </tr>
            </thead>
            <tbody>
              {report.columns.map((column) => (
                <tr key={column.key}>
                  <th scope="row">{column.header || column.key}</th>
                  <td>{column.inferredType}</td>
                  <td>
                    {column.missingCount} ({column.missingPercentage.toFixed(1)}%)
                  </td>
                  <td>{column.invalidNumericCount}</td>
                  <td>{column.dateFormats.join(', ') || 'None detected'}</td>
                  <td>{column.currencies.join(', ') || 'None detected'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="quality-detail-grid">
        <section className="card quality-detail" aria-labelledby="duplicate-title">
          <h2 id="duplicate-title">Duplicate rows</h2>
          <p>
            <strong>{report.duplicateCount}</strong> duplicate rows beyond the first occurrence.
          </p>
          <p>
            {report.duplicateRowIndices.length
              ? `Row indices: ${report.duplicateRowIndices.join(', ')}`
              : 'No duplicate row indices to display.'}
          </p>
        </section>
        <section className="card quality-detail" aria-labelledby="outlier-title">
          <h2 id="outlier-title">Numeric outliers</h2>
          {report.outliers.length ? (
            report.outliers.map((outlier) => (
              <div key={outlier.columnKey} className="outlier-detail">
                <h3>{outlier.header || outlier.columnKey}</h3>
                <dl>
                  <div>
                    <dt>Q1</dt>
                    <dd>{number(outlier.q1)}</dd>
                  </div>
                  <div>
                    <dt>Q3</dt>
                    <dd>{number(outlier.q3)}</dd>
                  </div>
                  <div>
                    <dt>IQR</dt>
                    <dd>{number(outlier.iqr)}</dd>
                  </div>
                  <div>
                    <dt>Lower bound</dt>
                    <dd>{number(outlier.lowerBound)}</dd>
                  </div>
                  <div>
                    <dt>Upper bound</dt>
                    <dd>{number(outlier.upperBound)}</dd>
                  </div>
                  <div>
                    <dt>Outliers</dt>
                    <dd>{outlier.outlierCount}</dd>
                  </div>
                </dl>
                <p>
                  {outlier.rowIndices.length
                    ? `Rows requiring review: ${outlier.rowIndices.join(', ')}`
                    : 'No values fall outside the IQR bounds.'}
                </p>
              </div>
            ))
          ) : (
            <p>No numeric column had enough values for IQR analysis.</p>
          )}
          <p className="help-text">
            An outlier is a value outside 1.5 times the interquartile range. It requires review and
            is not automatically an error.
          </p>
        </section>
      </div>
      <section className="warning-list" aria-labelledby="parse-warning-title">
        <h2 id="parse-warning-title">Parse warnings</h2>
        {dataset.parseWarnings.length ? (
          <ul>
            {dataset.parseWarnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        ) : (
          <p>No parser warnings were reported.</p>
        )}
      </section>
    </div>
  )
}
