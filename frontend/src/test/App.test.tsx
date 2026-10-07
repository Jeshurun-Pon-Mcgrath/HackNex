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
    expect(await screen.findByRole('heading', { level: 1, name: 'Your data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /load the demo data/i })).toBeInTheDocument()
  })

  it('navigates between product routes and identifies the active link', async () => {
    const user = userEvent.setup()
    renderRoute('/workspace')
    await user.click(screen.getAllByRole('link', { name: 'Evidence' })[0])
    expect(screen.getByRole('heading', { level: 1, name: 'Evidence' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Evidence' })[0]).toHaveClass('nav-link--active')
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
    expect(screen.getByLabelText(/add files/i)).toHaveAttribute(
      'accept',
      expect.stringContaining('.csv'),
    )
    expect(screen.getByText(/go to the Zynex backend on this machine/i)).toBeInTheDocument()
  })
})
