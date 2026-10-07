import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { useWorkspaceStore } from '../store/workspaceStore'

afterEach(() => {
  cleanup()
  useWorkspaceStore.getState().forget()
})
