import { render, screen, within } from '@testing-library/react'
import type { Run } from '../api/client'
import { ProofSeal, RunView } from '../components/proof/RunView'

const run: Run = {
  id: 'run-visual-test',
  question: 'What is the total revenue?',
  created_at: '2026-10-07T10:00:00Z',
  model: 'test-model',
  status: 'answered',
  answer: 42,
  display: '$42',
  explanation: 'Revenue was calculated from the orders table.',
  premises: [],
  traps: [],
  interpretations: [
    {
      index: 1,
      label: 'default',
      assumptions: [],
      ok: true,
      script: 'orders = pd.read_csv("orders.csv")\nresult = orders["revenue"].sum()',
    },
  ],
  hashes: {
    'orders.csv': '1234567890abcdef',
    'unused.csv': 'abcdef1234567890',
  },
  strength: { level: 3, checks: [] },
}

describe('proof visualizations', () => {
  it('maps proof levels to full, partial and empty color states', () => {
    const { rerender } = render(<ProofSeal run={run} />)
    expect(screen.getByRole('figure', { name: /proof strength l3/i })).toHaveClass('seal--full')

    rerender(<ProofSeal run={{ ...run, strength: { level: 2, checks: [] } }} />)
    expect(screen.getByRole('figure', { name: /proof strength l2/i })).toHaveClass('seal--partial')

    rerender(<ProofSeal run={{ ...run, strength: { level: 0, checks: [] } }} />)
    expect(screen.getByRole('figure', { name: /proof strength l0/i })).toHaveClass('seal--empty')
  })

  it('charts only data sources referenced by the proof', () => {
    render(<RunView run={run} workspaceId="workspace-test" />)

    const chart = screen.getByRole('figure', { name: 'Data used in this answer' })
    expect(within(chart).getByText('orders.csv')).toBeInTheDocument()
    expect(within(chart).queryByText('unused.csv')).not.toBeInTheDocument()
  })
})
