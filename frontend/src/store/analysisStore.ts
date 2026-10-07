import { create } from 'zustand'
import type { AnalysisSpecification } from '../types/analysis'

type AnalysisStore = {
  draft: AnalysisSpecification | null
  datasetId: string | null
  notice: string | null
  saveDraft: (draft: AnalysisSpecification) => void
  resetDraft: () => void
  invalidateForDataset: (datasetId: string | null) => void
  clearNotice: () => void
}
export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  draft: null,
  datasetId: null,
  notice: null,
  saveDraft: (draft) =>
    set({ draft, datasetId: draft.datasetId, notice: 'Draft saved in browser-session memory.' }),
  resetDraft: () => set({ draft: null, datasetId: null, notice: 'Analysis draft reset.' }),
  invalidateForDataset: (datasetId) => {
    const current = get()
    if (current.draft && current.datasetId !== datasetId)
      set({
        draft: null,
        datasetId: null,
        notice: 'The analysis draft was cleared because the active dataset changed.',
      })
  },
  clearNotice: () => set({ notice: null }),
}))
