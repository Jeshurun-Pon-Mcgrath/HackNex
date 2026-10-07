import { FileText, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type WorkspaceSummary } from '../api/client'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'
import { useWorkspaceStore } from '../store/workspaceStore'

export function FindingList({ summary }: { summary: WorkspaceSummary }) {
  if (summary.findings.length === 0)
    return <StatusMessage status="success">No data traps were found.</StatusMessage>
  return (
    <ul className="traps">
      {summary.findings.map((f) => (
        <li key={f.id}>
          <span className={`trap trap--${f.kind}`}>{f.kind.replace('_', ' ')}</span>
          <div>
            <p>{f.message}</p>
            <p className="muted">
              In {f.tables.join(' and ')}
              {f.examples.length > 0 && (
                <>
                  , for example{' '}
                  {[...new Set(f.examples.map((e) => (e.length > 48 ? `${e.slice(0, 48)}…` : e)))]
                    .slice(0, 3)
                    .map((e) => (
                      <code key={e}>{e}</code>
                    ))}
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function WorkspacePage() {
  const { summary, setSummary, forget } = useWorkspaceStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function guard(action: () => Promise<WorkspaceSummary | void>) {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (result) setSummary(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    await guard(async () => {
      let current = summary ?? (await api.createWorkspace())
      for (const file of Array.from(files)) current = await api.upload(current.workspace_id, file)
      return current
    })
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Your data"
        description="Add tables (CSV, XLSX) and the documents that define your business rules (MD, TXT, PDF). Before any question is asked, Zynex scans for duplicate rows, mixed currencies, ambiguous dates, missing values and tables that contradict each other."
      />
      {error && <StatusMessage status="error">{error}</StatusMessage>}

      <div className="actions">
        <label className={`button button--primary ${busy ? 'button--busy' : ''}`}>
          <Upload size={16} aria-hidden="true" /> Add files
          <input
            type="file"
            multiple
            accept=".csv,.xlsx,.md,.txt,.pdf"
            className="visually-hidden"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <Button variant="secondary" isLoading={busy} onClick={() => void guard(api.createDemo)}>
          Load the demo data
        </Button>
        {summary && (
          <Button variant="secondary" disabled={busy} onClick={forget}>
            Start over
          </Button>
        )}
      </div>
      <p className="muted">
        Files go to the Zynex backend on this machine and are read by a local model. Up to 20 MB per
        file.
      </p>

      {summary && (
        <>
          <section aria-labelledby="traps-title">
            <h2 id="traps-title">Data traps found</h2>
            <FindingList summary={summary} />
          </section>

          <section aria-labelledby="files-title">
            <h2 id="files-title">Files</h2>
            <ul className="files">
              {summary.files.map((f) => (
                <li key={f.name}>
                  <FileText size={16} aria-hidden="true" />
                  <strong>{f.name}</strong>
                  <code title={f.sha256}>{f.sha256.slice(0, 12)}</code>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${f.name}`}
                    title={`Remove ${f.name}`}
                    disabled={busy}
                    onClick={() => void guard(() => api.deleteFile(summary.workspace_id, f.name))}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="tables-title">
            <h2 id="tables-title">Tables</h2>
            {summary.tables.map((t) => (
              <details key={t.name} className="disclosure">
                <summary>
                  <strong>{t.name}</strong>
                  <span className="muted">
                    {t.rows} rows, {t.columns.length} columns
                  </span>
                </summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {t.columns.map((c) => (
                          <th key={c.name} scope="col">
                            {c.name}
                            <span className="muted">{c.dtype}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.preview.map((row, i) => (
                        <tr key={i}>
                          {t.columns.map((c) => (
                            <td key={c.name}>{row[c.name]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </section>

          {summary.documents.length > 0 && (
            <section aria-labelledby="docs-title">
              <h2 id="docs-title">Business rules</h2>
              <p className="muted">These documents override any assumption the model would make.</p>
              {summary.documents.map((d) => (
                <details key={d.name} className="disclosure">
                  <summary>
                    <strong>{d.name}</strong>
                  </summary>
                  <pre className="doc">{d.excerpt}</pre>
                </details>
              ))}
            </section>
          )}

          <Link className="button button--primary" to="/ask">
            Ask a question
          </Link>
        </>
      )}
    </div>
  )
}
