import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../app/App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { parseCsvText } from '../lib/parsers'
import { useDatasetStore } from '../store/datasetStore'
import { csvFixtures, csvMetadata } from './fixtures'

function renderRoute(route = '/workspace') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function loadRows(count: number) {
  const rows = Array.from({ length: count }, (_, index) => `Person ${index + 1},${index + 1}`).join(
    '\n',
  )
  const content = `name,value\n${rows}`
  useDatasetStore.getState().setDataset(parseCsvText(content, csvMetadata('people.csv', content)))
}

describe('Phase 2 interface', () => {
  it('accepts a valid file selection before processing', async () => {
    const user = userEvent.setup()
    renderRoute()
    const input = screen.getByLabelText('Choose file')
    await user.upload(input, new File([csvFixtures.valid], 'people.csv', { type: 'text/csv' }))
    expect(screen.getByText('people.csv')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process file' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel file selection' })).toBeEnabled()
  })

  it('rejects an unsupported file selection inline', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderRoute()
    await user.upload(
      screen.getByLabelText('Choose file'),
      new File(['bad'], 'data.pdf', { type: 'application/pdf' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This file type is not supported')
  })

  it('paginates the preview without rendering every row', async () => {
    const user = userEvent.setup()
    loadRows(12)
    renderRoute()
    expect(screen.getByText('Showing rows 1 to 10 of 12.')).toBeInTheDocument()
    expect(screen.queryByText('Person 11')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Showing rows 11 to 12 of 12.')).toBeInTheDocument()
    expect(screen.getByText('Person 11')).toBeInTheDocument()
  })

  it('shows Data Quality empty and loaded states accurately', () => {
    const emptyRender = renderRoute('/data-quality')
    expect(screen.getByRole('heading', { name: 'No dataset is available' })).toBeInTheDocument()
    emptyRender.unmount()
    loadRows(3)
    renderRoute('/data-quality')
    expect(screen.getByRole('heading', { name: 'Finding summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Column details' })).toBeInTheDocument()
    expect(
      screen.getByText('No overall quality score is assigned.', { exact: false }),
    ).toBeInTheDocument()
  })

  it('removes the dataset through an accessible dialog and restores the empty state', async () => {
    const user = userEvent.setup()
    loadRows(2)
    renderRoute()
    const removeButton = screen.getByRole('button', { name: 'Remove dataset' })
    await user.click(removeButton)
    const dialog = screen.getByRole('alertdialog', { name: 'Remove active dataset?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(removeButton).toHaveFocus()
    await user.click(removeButton)
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove dataset' }),
    )
    expect(screen.getByText('Choose a CSV or XLSX file to inspect locally.')).toBeInTheDocument()
    expect(useDatasetStore.getState().qualityReport).toBeNull()
  })
})
