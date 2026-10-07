import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../app/App'
import { parseCsvText } from '../lib/parsers'
import { useAnalysisStore } from '../store/analysisStore'
import { useDatasetStore } from '../store/datasetStore'
import { csvMetadata } from './fixtures'

function renderAnalysis() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/analysis']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function loadAnalysisDataset(name = 'analysis.csv') {
  const content = 'region,profit\nNorth,10\nSouth,20'
  const dataset = parseCsvText(content, csvMetadata(name, content))
  useDatasetStore.getState().setDataset(dataset)
  return dataset
}

describe('Analysis Workspace interface', () => {
  it('blocks the route when no active dataset exists', () => {
    renderAnalysis()
    expect(screen.getByRole('heading', { name: 'No dataset is available' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Data Workspace' })).toHaveAttribute(
      'href',
      '/workspace',
    )
  })

  it('shows real dataset context, the character count, and disconnected API state', async () => {
    const user = userEvent.setup()
    loadAnalysisDataset()
    renderAnalysis()
    expect(screen.getByText('analysis.csv')).toBeInTheDocument()
    const question = screen.getByLabelText('Ask one analytical question')
    await user.type(question, 'Total profit by region?')
    expect(screen.getByText('23/1000')).toBeInTheDocument()
    expect(screen.getByText('Analysis backend is not connected.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request analysis plan' })).toBeDisabled()
  })

  it('focuses an accessible error summary after invalid review', async () => {
    const user = userEvent.setup()
    loadAnalysisDataset()
    renderAnalysis()
    await user.click(screen.getByRole('button', { name: 'Validate and review' }))
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveFocus()
    expect(summary).toHaveTextContent('Enter one analytical question')
  })

  it('validates, previews, copies, saves, and resets a manual specification', async () => {
    const user = userEvent.setup()
    const dataset = loadAnalysisDataset()
    renderAnalysis()
    await user.type(screen.getByLabelText('Ask one analytical question'), 'What is total profit?')
    await user.click(screen.getByLabelText('Direct column'))
    await user.selectOptions(screen.getByLabelText('Metric column'), 'column_2')
    await user.selectOptions(screen.getByLabelText('Aggregation'), 'sum')
    await user.click(screen.getByRole('button', { name: 'Validate and review' }))
    const json = await screen.findByLabelText('Validated Analysis Specification JSON')
    expect(json).toHaveTextContent('"version": "1.0"')
    expect(json).toHaveTextContent(dataset.datasetId)
    await user.click(screen.getByRole('button', { name: 'Copy specification' }))
    expect(await screen.findByText(/Specification copied/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(useAnalysisStore.getState().draft?.datasetId).toBe(dataset.datasetId)
    await user.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(useAnalysisStore.getState().draft).toBeNull()
  })

  it('invalidates a saved draft when the active dataset is replaced', () => {
    const first = loadAnalysisDataset('first.csv')
    useAnalysisStore.getState().saveDraft({
      version: '1.0',
      datasetId: first.datasetId,
      question: 'Count rows',
      metric: { kind: 'row_count' },
      aggregation: 'count',
      groupBy: [],
      filters: [],
      sort: { target: 'metric', direction: 'descending' },
      limit: 1,
      requiredColumns: [],
      assumptions: [],
      createdAt: new Date().toISOString(),
    })
    loadAnalysisDataset('replacement.csv')
    expect(useAnalysisStore.getState().draft).toBeNull()
    expect(useAnalysisStore.getState().notice).toMatch(
      /cleared because the active dataset changed/i,
    )
  })
})
