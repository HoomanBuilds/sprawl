'use client'

import { PixelButton } from '@/components/ui/PixelButton';

interface CompareButtonProps {
  agentId: number;
  targetAgentId?: number;
}

export function CompareButton({ agentId, targetAgentId }: CompareButtonProps) {
  const handleCompare = () => {
    if (targetAgentId) {
      window.open(`/api/compare-card/${agentId}/${targetAgentId}?format=landscape`, '_blank');
    }
  };

  return (
    <PixelButton
      size="sm"
      variant="secondary"
      onClick={handleCompare}
      disabled={!targetAgentId}
    >
      Compare
    </PixelButton>
  );
}
