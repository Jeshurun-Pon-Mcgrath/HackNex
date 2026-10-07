import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Brand } from './Brand'
import { Sidebar } from './Sidebar'
import { IconButton } from '../ui/IconButton'

type MobileNavigationProps = {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export function MobileNavigation({ open, onClose, triggerRef }: MobileNavigationProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [onClose, open, triggerRef])

  if (!open) return null
  return (
    <div className="mobile-nav" role="presentation">
      <button className="mobile-nav__backdrop" aria-label="Dismiss navigation" onClick={onClose} />
      <div
        className="mobile-nav__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        ref={dialogRef}
      >
        <div className="mobile-nav__header">
          <Brand />
          <IconButton label="Close navigation" onClick={onClose} ref={closeRef}>
            <X size={21} />
          </IconButton>
        </div>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  )
}
