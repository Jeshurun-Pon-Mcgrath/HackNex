import { Inbox } from 'lucide-react'
import { Button } from './Button'
import { Card } from './Card'

type EmptyStateProps = {
  title: string
  description: string
  actionLabel?: string
  actionUnavailableReason?: string
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionUnavailableReason,
}: EmptyStateProps) {
  return (
    <Card className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Inbox size={24} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && (
        <div className="empty-state__action">
          <Button disabled aria-describedby="future-action-reason">
            {actionLabel}
          </Button>
          <p id="future-action-reason" className="help-text">
            {actionUnavailableReason}
          </p>
        </div>
      )}
    </Card>
  )
}
