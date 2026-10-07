import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { useDatasetStore } from '../store/datasetStore'
import { useAnalysisStore } from '../store/analysisStore'

afterEach(() => {
  cleanup()
  useDatasetStore.getState().clearDataset()
  useAnalysisStore.setState({ draft: null, datasetId: null, notice: null })
})
