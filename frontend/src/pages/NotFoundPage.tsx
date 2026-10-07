import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'

export function NotFoundPage() {
  return (
    <div className="page-container not-found">
      <PageHeader title="Page not found" description="The requested page does not exist." />
      <Link className="button button--primary" to="/workspace">
        Return to workspace
      </Link>
    </div>
  )
}
