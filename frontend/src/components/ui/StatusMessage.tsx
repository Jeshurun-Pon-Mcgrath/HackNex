import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Status = 'info' | 'success' | 'warning' | 'error'
const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle }

export function StatusMessage({
  status = 'info',
  children,
}: {
  status?: Status
  children: ReactNode
}) {
  const Icon = icons[status]
  return (
    <div className={`status status--${status}`} role={status === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
