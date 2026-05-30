import { type HTMLAttributes, type ReactNode } from 'react'

type Variant = 'default' | 'pink' | 'cyan' | 'elevated' | 'warm'

interface PixelCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: Variant
  title?: ReactNode
  headerRight?: ReactNode
  bodyClassName?: string
}

const variantStyles: Record<Variant, { wrap: string; shadow: string; header: string; headerText: string }> = {
  default: {
    wrap:       'border-4 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  pink: {
    wrap:       'border-4 border-[color:var(--color-sprawl-red)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  cyan: {
    wrap:       'border-4 border-[color:var(--color-sprawl-cyan)] bg-[color:var(--color-sprawl-card)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  elevated: {
    wrap:       'border-4 border-[color:var(--color-sprawl-border-hi)] bg-[color:var(--color-sprawl-card-hi)]',
    shadow:     'shadow-[4px_4px_0_0_var(--color-sprawl-bg)]',
    header:     'border-b-4 border-[color:var(--color-sprawl-bg)] bg-[color:var(--color-sprawl-bg)]',
    headerText: 'text-[color:var(--color-sprawl-cream)]',
  },
  warm: {
    wrap:       'border border-[color:var(--color-sprawl-accent)]/35 bg-[rgba(13,13,15,0.86)] backdrop-blur-sm',
    shadow:     '',
    header:     'border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.5)]',
    headerText: 'text-[color:var(--color-sprawl-accent)]',
  },
}

export function PixelCard({
  variant = 'default',
  title,
  headerRight,
  bodyClassName,
  className = '',
  children,
  ...rest
}: PixelCardProps) {
  const v = variantStyles[variant]
  return (
    <div className={[v.wrap, v.shadow, className].join(' ')} {...rest}>
      {title !== undefined && (
        <div className={`flex items-center justify-between px-4 py-2 ${v.header}`}>
          <h3 className={`font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase ${v.headerText}`}>
            {title}
          </h3>
          {headerRight}
        </div>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </div>
  )
}
