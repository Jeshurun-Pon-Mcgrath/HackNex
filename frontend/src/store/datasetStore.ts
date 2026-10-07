import { create } from 'zustand'
import { buildQualityReport } from '../lib/quality'
import type { ActiveDataset, DatasetStoreState } from '../types/dataset'
import { useAnalysisStore } from './analysisStore'

type DatasetActions = {
  setReading: () => void
  setDataset: (dataset: ActiveDataset) => void
  setError: (message: string) => void
  clearDataset: () => void
}

const initialState: DatasetStoreState = {
  activeDataset: null,
  qualityReport: null,
  analysisStatus: 'idle',
  error: null,
}

export const useDatasetStore = create<DatasetStoreState & DatasetActions>((set) => ({
  ...initialState,
  setReading: () => set({ analysisStatus: 'reading', error: null }),
  setDataset: (dataset) => {
    useAnalysisStore.getState().invalidateForDataset(dataset.datasetId)
    set({
      activeDataset: dataset,
      qualityReport: buildQualityReport(dataset),
      analysisStatus: 'ready',
      error: null,
    })
  },
  setError: (message) => set({ analysisStatus: 'error', error: message }),
  clearDataset: () => {
    useAnalysisStore.getState().invalidateForDataset(null)
    set(initialState)
  },
}))
