import { FileSpreadsheet, FileText } from 'lucide-react'
import { formatFileSize } from '../../lib/fileValidation'
import type { ActiveDataset } from '../../types/dataset'

export function DatasetSummary({ dataset }: { dataset: ActiveDataset }) {
  const Icon = dataset.fileType === 'csv' ? FileText : FileSpreadsheet
  const items = [
    ['File type', dataset.fileType.toUpperCase()],
    ['File size', formatFileSize(dataset.fileSize)],
    ['Rows', dataset.rowCount.toLocaleString()],
    ['Columns', dataset.columnCount.toLocaleString()],
    ['Parse warnings', dataset.parseWarnings.length.toLocaleString()],
  ]
  if (dataset.selectedSheet) items.splice(1, 0, ['Worksheet', dataset.selectedSheet])
  return (
    <section className="dataset-summary" aria-labelledby="dataset-name">
      <div className="dataset-summary__identity">
        <Icon size={24} aria-hidden="true" />
        <div>
          <p>Active dataset</p>
          <h2 id="dataset-name">{dataset.fileName}</h2>
        </div>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
