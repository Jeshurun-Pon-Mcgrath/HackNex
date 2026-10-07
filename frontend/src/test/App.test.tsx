import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../app/App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function renderRoute(route = '/') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Zynex application', () => {
  it('redirects to and renders the workspace', async () => {
    renderRoute()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Data Workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Choose a CSV or XLSX file to inspect locally.')).toBeInTheDocument()
  })

  it('navigates between product routes and identifies the active link', async () => {
    const user = userEvent.setup()
    renderRoute('/workspace')
    const analysisLinks = screen.getAllByRole('link', { name: 'Analysis' })
    await user.click(analysisLinks[0])
    expect(screen.getByRole('heading', { level: 1, name: 'Analysis' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Analysis' })[0]).toHaveClass('nav-link--active')
  })

  it('opens and closes accessible mobile navigation with Escape', async () => {
    const user = userEvent.setup()
    renderRoute('/workspace')
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(openButton)
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })

  it('provides working legal links and draft policy content', async () => {
    const user = userEvent.setup()
    renderRoute('/workspace')
    await user.click(screen.getByRole('link', { name: 'Privacy Policy' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/pending final legal and deployment review/i)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Terms and Conditions' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms and Conditions' }),
    ).toBeInTheDocument()
  })

  it('renders a not-found route with a recovery action', () => {
    renderRoute('/missing-page')
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to workspace' })).toHaveAttribute(
      'href',
      '/workspace',
    )
  })

  it('exposes keyboard-accessible controls and a skip link', async () => {
    const user = userEvent.setup()
    renderRoute('/workspace')
    await user.tab()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus()
    expect(screen.getByLabelText('Choose file')).toHaveAttribute(
      'accept',
      expect.stringContaining('.csv'),
    )
    expect(screen.getByText(/held in memory only/i)).toBeInTheDocument()
  })
})
