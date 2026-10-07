import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, ...props },
  ref,
) {
  return (
    <button ref={ref} className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
})
