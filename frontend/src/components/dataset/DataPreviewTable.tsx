import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Columns3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isMissing } from '../../lib/quality'
import type { ActiveDataset, CellValue, ParsedRow } from '../../types/dataset'
import { Button } from '../ui/Button'

const previewFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})
function Cell({ value }: { value: CellValue | undefined }) {
  if (isMissing(value)) return <span className="missing-value">Missing</span>
  const display = String(value)
  return (
    <span className="cell-value" title={display}>
      {display}
    </span>
  )
}

function cellValue(value: unknown): CellValue | undefined {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value
  return undefined
}

export function DataPreviewTable({ dataset }: { dataset: ActiveDataset }) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const columns = useMemo<ColumnDef<typeof previewFeatures, ParsedRow, unknown>[]>(
    () =>
      dataset.headers.map((column): ColumnDef<typeof previewFeatures, ParsedRow, unknown> => ({
        id: column.key,
        accessorFn: (row) => row[column.key],
        header: () => (
          <span className="table-header">
            <strong>{column.header || `Column ${column.position + 1}`}</strong>
            <small>{column.inferredType}</small>
          </span>
        ),
        cell: ({ getValue }) => <Cell value={cellValue(getValue())} />,
      })),
    [dataset.headers],
  )
  const table = useTable({
    features: previewFeatures,
    data: dataset.rows,
    columns,
    state: { pagination, columnVisibility },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
  })
  const pageRows = table.getRowModel().rows
  const firstRow = dataset.rowCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const lastRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, dataset.rowCount)
  return (
    <section className="preview-section" aria-labelledby="preview-title">
      <div className="section-heading">
        <div>
          <h2 id="preview-title">Data preview</h2>
          <p>
            Showing rows {firstRow} to {lastRow} of {dataset.rowCount.toLocaleString()}.
          </p>
        </div>
        <details className="column-control">
          <summary>
            <Columns3 size={18} aria-hidden="true" />
            Columns
          </summary>
          <fieldset>
            <legend>Visible columns</legend>
            {table.getAllLeafColumns().map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {dataset.headers.find((header) => header.key === column.id)?.header || column.id}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable data preview">
        <table className="data-table">
          <caption className="visually-hidden">
            Preview of {dataset.fileName}. Values are shown exactly as parsed.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="row-number">
                Row
              </th>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th key={header.id} scope="col">
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowOffset) => (
              <tr key={row.id}>
                <th scope="row" className="row-number">
                  {pagination.pageIndex * pagination.pageSize + rowOffset + 1}
                </th>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <label>
          Rows per page
          <select
            value={pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span>
          Page {table.state.pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </span>
        <Button
          variant="secondary"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="secondary"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
