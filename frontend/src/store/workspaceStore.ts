import { create } from 'zustand'
import type { WorkspaceSummary } from '../api/client'

const KEY = 'prooflens.workspace'

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

type WorkspaceState = {
  workspaceId: string | null
  summary: WorkspaceSummary | null
  setSummary: (summary: WorkspaceSummary) => void
  forget: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaceId: remembered(),
  summary: null,
  setSummary: (summary) => {
    try {
      localStorage.setItem(KEY, summary.workspace_id)
    } catch {
      // storage unavailable: the workspace just isn't remembered across reloads
    }
    set({ summary, workspaceId: summary.workspace_id })
  },
  forget: () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // ignore
    }
    set({ summary: null, workspaceId: null })
  },
}))
