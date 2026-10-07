import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Application error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-page">
          <div>
            <h1>Something went wrong</h1>
            <p>
              The application could not display this page. No technical details have been exposed.
            </p>
            <Button onClick={() => window.location.assign('/workspace')}>
              Return to workspace
            </Button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
