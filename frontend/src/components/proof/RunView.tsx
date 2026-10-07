import { Check, Copy, Play, X } from 'lucide-react'
import { useState } from 'react'
import { api, type Interpretation, type RerunResult, type Run } from '../../api/client'
import { Button } from '../ui/Button'

const LEVEL_NAMES = ['No claim', 'Runs', 'Reproducible', 'Robust']
const VERDICTS = { answered: 'Answered', ambiguous: 'Depends on a reading', refused: 'Refused' }

// Three arcs, one per proof level, drawn clockwise from the top with small gaps.
const R = 42
const ARC = (2 * Math.PI * R) / 3
const GAP = 7

export function ProofSeal({ run }: { run: Run }) {
  const { level } = run.strength
  return (
    <figure className="seal" aria-label={`Proof strength L${level}: ${LEVEL_NAMES[level]}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <circle
            key={n}
            className={n <= level ? 'seal__arc seal__arc--on' : 'seal__arc'}
            cx="50"
            cy="50"
            r={R}
            strokeDasharray={`${ARC - GAP} ${2 * Math.PI * R}`}
            transform={`rotate(${-90 + (n - 1) * 120 + (GAP / (2 * Math.PI * R)) * 180} 50 50)`}
            style={{ animationDelay: `${n * 140}ms` }}
          />
        ))}
        <text x="50" y="57" textAnchor="middle" className="seal__level">
          L{level}
        </text>
      </svg>
      <figcaption>{LEVEL_NAMES[level]}</figcaption>
    </figure>
  )
}

function Checks({ run }: { run: Run }) {
  if (run.strength.checks.length === 0)
    return <p className="checks__none">No number was produced, so there is nothing to prove.</p>
  return (
    <ol className="checks">
      {run.strength.checks.map((check) => (
        <li key={check.level} className={check.passed ? 'checks__pass' : 'checks__fail'}>
          {check.passed ? (
            <Check size={15} aria-label="passed" />
          ) : (
            <X size={15} aria-label="not passed" />
          )}
          <span>
            <strong>{check.name}</strong>
            {check.detail}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ProofScript({ interp }: { interp: Interpretation }) {
  const [copied, setCopied] = useState(false)
  if (!interp.script) return null
  return (
    <details className="disclosure">
      <summary>Proof script for “{interp.label}”</summary>
      <Button
        variant="secondary"
        className="disclosure__action"
        onClick={() => {
          void navigator.clipboard?.writeText(interp.script ?? '').then(() => setCopied(true))
        }}
      >
        <Copy size={15} aria-hidden="true" /> {copied ? 'Copied' : 'Copy script'}
      </Button>
      <pre className="code">
        <code>{interp.script}</code>
      </pre>
    </details>
  )
}

function Rerun({ workspaceId, run }: { workspaceId: string; run: Run }) {
  const [result, setResult] = useState<RerunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function rerun() {
    setBusy(true)
    setError('')
    try {
      setResult(await api.rerun(workspaceId, run.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rerun">
      <Button variant="secondary" isLoading={busy} onClick={() => void rerun()}>
        <Play size={15} aria-hidden="true" /> {busy ? 'Re-running' : 'Re-run proofs'}
      </Button>
      <ul aria-live="polite">
        {error && <li className="bad">{error}</li>}
        {result?.results.map((r) => (
          <li key={r.index} className={r.match ? 'ok' : 'bad'}>
            {r.match ? 'Reproduced' : 'Mismatch'} for “{r.label}”: {JSON.stringify(r.reproduced)}
            {r.error && ` (${r.error})`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Context({ run }: { run: Run }) {
  if (run.traps.length === 0 && run.premises.length === 0) return null
  return (
    <div className="cert__context">
      {run.traps.length > 0 && (
        <section>
          <h3>Data traps handled</h3>
          <ul className="plain-list">
            {run.traps.map((trap) => (
              <li key={trap.id}>
                <span className={`trap trap--${trap.kind}`}>{trap.kind.replace('_', ' ')}</span>
                {trap.message}
                {trap.how && <span className="muted">Handled: {trap.how}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {run.premises.length > 0 && (
        <section>
          <h3>What the question assumes</h3>
          <ul className="plain-list">
            {[...new Map(run.premises.map((p) => [p.detail, p])).values()].map((p, i) => (
              <li key={i} className={p.ok ? 'premise' : 'premise premise--failed'}>
                {p.ok ? <Check size={14} aria-label="holds" /> : <X size={14} aria-label="fails" />}
                {p.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function RunView({
  run,
  workspaceId,
  onChange,
}: {
  run: Run
  workspaceId: string
  onChange?: (run: Run) => void
}) {
  const good = run.interpretations.filter((i) => i.ok)
  const shown = run.adopted ? good.filter((i) => i.index === run.adopted) : good

  return (
    <article className={`cert cert--${run.status}`} aria-label="Answer certificate">
      <div className="cert__body">
        <div className="cert__main">
          <p className="cert__verdict">{VERDICTS[run.status]}</p>
          <h2 className="cert__question">{run.question}</h2>

          {run.status === 'answered' && (
            <>
              <p className="cert__answer" data-testid="answer">
                {run.display}
              </p>
              <p className="cert__explanation">{run.explanation}</p>
              {shown[0]?.assumptions.length > 0 && (
                <ul className="assumptions">
                  {shown[0].assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {good.length > 1 && !run.adopted && (
                <p className="muted">
                  {good.length} independent readings of the data were computed, and all agree.
                </p>
              )}
            </>
          )}

          {run.status === 'ambiguous' && (
            <section className="matrix" aria-label="Interpretation matrix">
              <p className="cert__explanation">
                {run.clarifying_question || 'Choose the reading that matches what you meant.'}
              </p>
              <div className="matrix__scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Reading</th>
                      <th scope="col">Assumes</th>
                      <th scope="col">Answer</th>
                      <th scope="col">
                        <span className="visually-hidden">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.interpretations.map((interp) => (
                      <tr key={interp.index}>
                        <th scope="row">{interp.label}</th>
                        <td>{interp.assumptions.join('; ')}</td>
                        <td className="matrix__value">
                          {interp.ok ? interp.display : 'Did not run'}
                        </td>
                        <td>
                          {interp.ok && (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void api.adopt(workspaceId, run.id, interp.index).then(onChange)
                              }
                            >
                              Use this reading
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {run.status === 'refused' && run.refusal && (
            <section className="refusal" aria-label="Refusal certificate">
              <p
                className={
                  run.refusal.reason.length < 90
                    ? 'refusal__reason refusal__reason--short'
                    : 'refusal__reason'
                }
              >
                {run.refusal.reason}
              </p>
              {run.refusal.needed && (
                <p>
                  <strong>To make this answerable: </strong>
                  {run.refusal.needed}
                </p>
              )}
              <p className="muted">
                Reason code <code>{run.refusal.code}</code>
              </p>
            </section>
          )}
        </div>

        <aside className="cert__proof" aria-label="How this was proven">
          <ProofSeal run={run} />
          <Checks run={run} />
        </aside>
      </div>

      <Context run={run} />

      {run.status !== 'refused' && (
        <div className="cert__scripts">
          {shown.map((interp) => (
            <ProofScript key={interp.index} interp={interp} />
          ))}
          <Rerun workspaceId={workspaceId} run={run} />
        </div>
      )}

      <footer className="cert__footer">
        <span>
          Issued {new Date(run.created_at).toLocaleString()} by {run.model}
        </span>
        <span>
          Inputs pinned by SHA-256:{' '}
          {Object.entries(run.hashes).map(([name, hash]) => (
            <span key={name} className="hash" title={hash}>
              {name} <code>{hash.slice(0, 10)}</code>
            </span>
          ))}
        </span>
      </footer>
    </article>
  )
}
