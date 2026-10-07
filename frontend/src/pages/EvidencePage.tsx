import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { RunView } from '../components/proof/RunView'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'
import { useWorkspaceStore } from '../store/workspaceStore'

export function EvidencePage() {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId)
  const client = useQueryClient()
  const runs = useQuery({
    queryKey: ['runs', workspaceId],
    queryFn: () => api.runs(workspaceId!),
    enabled: Boolean(workspaceId),
  })

  return (
    <div className="page-container">
      <PageHeader
        title="Evidence"
        description="Every question asked about this data, newest first, with its proofs, assumptions and refusals."
      />
      {!workspaceId ? (
        <StatusMessage status="warning">
          There is no data yet. <Link to="/workspace">Add files or load the demo first.</Link>
        </StatusMessage>
      ) : (
        <>
          <section className="kit" aria-labelledby="kit-title">
            <div>
              <h2 id="kit-title">Check every claim yourself</h2>
              <p>
                The proof kit holds your data, every proof script and a verifier. Unzip it, run{' '}
                <code>pip install pandas openpyxl</code>, then <code>python verify_all.py</code>. It
                re-runs each proof against the hash-pinned data and reports a pass or fail per
                claim.
              </p>
            </div>
            <a className="button button--primary" href={api.bundleUrl(workspaceId)}>
              <Download size={16} aria-hidden="true" /> Download proof kit
            </a>
          </section>
          {runs.isLoading && <StatusMessage>Loading the evidence.</StatusMessage>}
          {runs.error && <StatusMessage status="error">{runs.error.message}</StatusMessage>}
          {runs.data?.length === 0 && (
            <StatusMessage>
              No questions have been asked yet. <Link to="/ask">Ask the first one.</Link>
            </StatusMessage>
          )}
          <div className="stack">
            {runs.data?.map((run) => (
              <RunView
                key={run.id}
                run={run}
                workspaceId={workspaceId}
                onChange={() => void client.invalidateQueries({ queryKey: ['runs', workspaceId] })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
