'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-[color:var(--color-sprawl-accent)] text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-105',
  secondary: 'bg-[color:var(--color-sprawl-cyan)]   text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  success:   'bg-[color:var(--color-sprawl-lime)]   text-[color:var(--color-sprawl-bg)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  danger:    'bg-[color:var(--color-sprawl-red)]    text-[color:var(--color-sprawl-cream)] border-[color:var(--color-sprawl-bg)] hover:brightness-110',
  ghost:     'bg-[rgba(13,13,15,0.55)]              text-[color:var(--color-sprawl-cream)] border-[color:var(--color-sprawl-accent)]/40 hover:bg-[rgba(13,13,15,0.75)] hover:border-[color:var(--color-sprawl-accent)]/60',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-4 text-base',
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  function PixelButton(
    { className = '', variant = 'primary', size = 'md', loading, disabled, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'font-[family-name:var(--font-pixel)]',
          'border-4 uppercase tracking-wider',
          'transition-none select-none cursor-pointer',
          'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
          'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--color-sprawl-bg)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0',
          'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-sprawl-accent)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-sprawl-bg)]',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="animate-blink">_</span>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)
