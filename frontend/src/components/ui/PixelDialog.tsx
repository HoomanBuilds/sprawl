'use client'

import { type ReactNode, useEffect } from 'react'
import { PixelCard } from './PixelCard'

interface PixelDialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  hideCloseButton?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap: Record<Required<PixelDialogProps>['size'], string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function PixelDialog({
  open, onClose, title, children, hideCloseButton, size = 'md',
}: PixelDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[color:var(--color-sprawl-bg)]/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${sizeMap[size]} flex min-h-0 flex-col max-h-[min(92dvh,52rem)]`}>
        <PixelCard
          variant="warm"
          title={title}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4"
          headerRight={
            !hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-muted)] hover:text-[color:var(--color-sprawl-accent)] cursor-pointer"
              >
                [ X ]
              </button>
            )
          }
        >
          {children}
        </PixelCard>
      </div>
    </div>
  )
}
