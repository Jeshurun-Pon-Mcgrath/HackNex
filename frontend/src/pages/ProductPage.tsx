import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import type { ProductPageConfig } from '../types/navigation'

export function ProductPage({ page }: { page: ProductPageConfig }) {
  return (
    <div className="page-container">
      <PageHeader title={page.title} description={page.description} />
      <EmptyState
        title={page.emptyTitle}
        description={page.emptyDescription}
        actionLabel={page.actionLabel}
        actionUnavailableReason={page.actionUnavailableReason}
      />
    </div>
  )
}
