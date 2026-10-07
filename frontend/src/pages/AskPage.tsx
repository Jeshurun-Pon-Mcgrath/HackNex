import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AgentEvent, type Run } from '../api/client'
import { RunView } from '../components/proof/RunView'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'
import { useWorkspaceStore } from '../store/workspaceStore'

const EXAMPLES = [
  'What is the total revenue in USD?',
  'What was the total revenue in USD in March 2024?',
  'Which region generated the most revenue in USD?',
  'What was the revenue on February 30, 2024?',
  'What is our total profit margin?',
]

function describe(event: AgentEvent): { text: string; ok?: boolean } {
  switch (event.type) {
    case 'scan':
      return { text: `Scanned the data: ${event.findings.length} traps on record`, ok: true }
    case 'premises': {
      const failed = event.premises.filter((p) => !p.ok)
      return failed.length
        ? { text: `A premise fails: ${failed.map((p) => p.detail).join('; ')}`, ok: false }
        : { text: `Checked ${event.premises.length} premises; all hold`, ok: true }
    }
    case 'plan':
      if (event.status === 'thinking')
        return { text: `Planning the analysis (try ${event.attempt})` }
      return event.problems?.length
        ? { text: `Plan rejected, retrying: ${event.problems.join(' ')}`, ok: false }
        : {
            text: `Planned ${event.interpretations?.length ?? 0} reading(s): ${event.interpretations?.join(', ')}`,
            ok: true,
          }
    case 'exec':
      return event.ok
        ? { text: `Proof “${event.label}” ran and reproduced`, ok: true }
        : {
            text: `Proof “${event.label}” failed (try ${event.attempt}): ${event.error}`,
            ok: false,
          }
    case 'result':
      return { text: 'Certificate issued', ok: event.run.status !== 'refused' }
    case 'error':
      return { text: event.message, ok: false }
  }
}

export function AskPage() {
  const { workspaceId, summary } = useWorkspaceStore()
  const [question, setQuestion] = useState('')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  async function ask(text: string) {
    if (!workspaceId || !text.trim()) return
    abort.current?.abort()
    abort.current = new AbortController()
    setEvents([])
    setRun(null)
    setError('')
    setRunning(true)
    try {
      for await (const event of api.ask(workspaceId, text, abort.current.signal)) {
        setEvents((list) => [...list, event])
        if (event.type === 'result') setRun(event.run)
        if (event.type === 'error') setError(event.message)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  if (!workspaceId)
    return (
      <div className="page-container">
        <PageHeader title="Ask a question" description="Questions are answered from your files." />
        <StatusMessage status="warning">
          There is no data yet. <Link to="/workspace">Add files or load the demo first.</Link>
        </StatusMessage>
      </div>
    )

  return (
    <div className="page-container">
      <PageHeader
        title="Ask a question"
        description="Every number comes with a script that reproduces it. If the data can be read more than one way you see each answer, and if it can’t be answered reliably you get a refusal with the reason."
      />
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <label htmlFor="question" className="visually-hidden">
          Question
        </label>
        <textarea
          id="question"
          value={question}
          maxLength={1000}
          rows={2}
          placeholder="What is the total revenue in USD?"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(question)
            }
          }}
        />
        <Button type="submit" isLoading={running} disabled={!question.trim()}>
          {running ? 'Working' : 'Ask'}
        </Button>
      </form>
      {summary?.files.some((f) => f.name === 'orders.csv') && (
        <div className="examples">
          <p className="muted">Try one from the demo:</p>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="chip"
                  disabled={running}
                  onClick={() => {
                    setQuestion(example)
                    void ask(example)
                  }}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <StatusMessage status="error">{error}</StatusMessage>}

      {events.length > 0 && (
        <ol className="log" aria-live="polite" aria-label="Progress">
          {events.map((event, i) => {
            const { text, ok } = describe(event)
            return (
              <li key={i} className={ok === false ? 'log__bad' : undefined}>
                {ok === undefined ? (
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                ) : ok ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <X size={14} aria-hidden="true" />
                )}
                <span>{text}</span>
              </li>
            )
          })}
          {running && (
            <li className="log__waiting">
              <Loader2 size={14} className="spin" aria-hidden="true" />
              <span>The local model is working. This usually takes 20 to 90 seconds.</span>
            </li>
          )}
        </ol>
      )}

      {run && <RunView run={run} workspaceId={workspaceId} onChange={setRun} />}
    </div>
  )
}
