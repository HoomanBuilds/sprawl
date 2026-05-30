'use client'

import { useState } from 'react';
import { CompareButton } from '@/components/CompareButton';

interface CompareWidgetProps {
  agentId: number;
}

export function CompareWidget({ agentId }: CompareWidgetProps) {
  const [input, setInput] = useState('');
  const parsed = parseInt(input, 10);
  const targetAgentId = Number.isFinite(parsed) && parsed > 0 && parsed !== agentId ? parsed : undefined;

  return (
    <div className="flex gap-2 items-stretch">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="compare vs agent #…"
        aria-label="Agent ID to compare against"
        className="font-[family-name:var(--font-pixel)] text-xs uppercase bg-[rgba(13,13,15,0.55)] text-[color:var(--color-sprawl-cream)] border-4 border-[color:var(--color-sprawl-accent)]/40 px-3 py-1.5 w-44 focus:outline-none focus:border-[color:var(--color-sprawl-accent)] placeholder:text-[color:var(--color-sprawl-muted)]"
      />
      <CompareButton agentId={agentId} targetAgentId={targetAgentId} />
    </div>
  );
}
