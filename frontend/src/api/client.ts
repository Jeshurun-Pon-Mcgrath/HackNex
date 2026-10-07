export const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8000'
).replace(/\/$/, '')

export type Finding = {
  id: string
  kind: string
  tables: string[]
  columns: string[]
  message: string
  count: number
  examples: string[]
  how?: string
}

export type TableInfo = {
  name: string
  file: string
  load: string
  rows: number
  columns: { name: string; dtype: string }[]
  preview: Record<string, string>[]
}

export type WorkspaceSummary = {
  workspace_id: string
  files: { name: string; sha256: string }[]
  tables: TableInfo[]
  documents: { name: string; excerpt: string }[]
  findings: Finding[]
}

export type Interpretation = {
  index: number
  label: string
  assumptions: string[]
  script?: string
  ok?: boolean
  value?: unknown
  display?: string
  error?: string
  deterministic?: boolean
}

export type Premise = { kind: string; column: string; value: string; ok: boolean; detail: string }

export type Run = {
  id: string
  question: string
  created_at: string
  model: string
  status: 'answered' | 'ambiguous' | 'refused'
  answer: unknown
  display: string
  unit?: string
  explanation: string
  clarifying_question?: string
  refusal?: { code: string; reason: string; needed: string }
  premises: Premise[]
  traps: Finding[]
  interpretations: Interpretation[]
  hashes: Record<string, string>
  adopted?: number
  strength: {
    level: number
    checks: { level: number; name: string; passed: boolean; detail: string }[]
  }
}

export type AgentEvent =
  | { type: 'scan'; findings: Finding[] }
  | { type: 'premises'; premises: Premise[]; decision: string }
  | {
      type: 'plan'
      attempt: number
      status: 'thinking' | 'checked'
      interpretations?: string[]
      problems?: string[]
    }
  | { type: 'exec'; index: number; label: string; attempt: number; ok: boolean; error: string }
  | { type: 'result'; run: Run }
  | { type: 'error'; error_code: string; message: string }

export type RerunResult = {
  run_id: string
  results: {
    index: number
    label: string
    claimed: unknown
    reproduced: unknown
    match: boolean
    error: string
  }[]
}

export type Health = { status: string; llm: string; model: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

const post = { method: 'POST' }
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<Health>('/health'),
  createWorkspace: () => request<WorkspaceSummary>('/workspaces', post),
  createDemo: () => request<WorkspaceSummary>('/workspaces/demo', post),
  getWorkspace: (id: string) => request<WorkspaceSummary>(`/workspaces/${id}`),
  upload: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<WorkspaceSummary>(`/workspaces/${id}/files`, { method: 'POST', body: form })
  },
  deleteFile: (id: string, name: string) =>
    request<WorkspaceSummary>(`/workspaces/${id}/files/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  runs: (id: string) => request<Run[]>(`/workspaces/${id}/runs`),
  rerun: (id: string, runId: string) =>
    request<RerunResult>(`/workspaces/${id}/runs/${runId}/rerun`, post),
  adopt: (id: string, runId: string, index: number) =>
    request<Run>(`/workspaces/${id}/runs/${runId}/adopt`, json({ index })),
  bundleUrl: (id: string) => `${API_BASE}/api/v1/workspaces/${id}/bundle.zip`,

  async *ask(id: string, question: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const response = await fetch(`${API_BASE}/api/v1/workspaces/${id}/ask`, {
      ...json({ question }),
      signal,
    })
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      throw new Error(body.message ?? `Request failed (${response.status})`)
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) yield JSON.parse(line) as AgentEvent
    }
    if (buffer.trim()) yield JSON.parse(buffer) as AgentEvent
  },
}
