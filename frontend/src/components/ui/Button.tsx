import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: 'primary' | 'secondary'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = 'primary', isLoading = false, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`button button--${variant} ${className}`.trim()}
      aria-busy={isLoading || undefined}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {children}
    </button>
  )
})
