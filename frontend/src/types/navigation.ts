import type { LucideIcon } from 'lucide-react'

export type ProductPageConfig = {
  path: string
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  actionLabel?: string
  actionUnavailableReason?: string
  icon: LucideIcon
}
