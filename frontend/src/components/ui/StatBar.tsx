interface StatBarProps {
  label: string
  value: number
  max?: number
  variant?: 'sprawl' | 'pnl' | 'raid' | 'xp' | 'health'
  segments?: number
  showValue?: boolean
}

const variantColor: Record<Required<StatBarProps>['variant'], string> = {
  sprawl: 'bg-[color:var(--color-sprawl-accent)]',
  pnl:    'bg-[color:var(--color-sprawl-cyan)]',
  raid:   'bg-[color:var(--color-sprawl-red)]',
  xp:     'bg-[color:var(--color-sprawl-purple)]',
  health: 'bg-[color:var(--color-sprawl-lime)]',
}

export function StatBar({
  label, value, max = 100, variant = 'sprawl', segments = 10, showValue = true,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(pct * segments)

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-sprawl-muted)]">
        {label}
      </span>
      <div
        className="flex-1 flex gap-0.5 border-2 border-[color:var(--color-sprawl-border)] bg-[color:var(--color-sprawl-bg)] p-0.5"
        role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className={['h-3 flex-1', i < filled ? variantColor[variant] : 'bg-[color:var(--color-sprawl-card)]'].join(' ')} />
        ))}
      </div>
      {showValue && (
        <span className="w-12 text-right font-[family-name:var(--font-pixel)] text-[10px] text-[color:var(--color-sprawl-cream)]">
          {Math.round(value)}/{max}
        </span>
      )}
    </div>
  )
}
