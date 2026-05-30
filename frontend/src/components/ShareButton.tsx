'use client'

import { useState } from 'react';
import { PixelButton } from '@/components/ui/PixelButton';

interface ShareButtonProps {
  agentId: number;
  agentName: string;
}

export function ShareButton({ agentId, agentName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const shareUrl = `${window.location.origin}/agent/${agentId}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/agent/${agentId}`;
    const tweetText = encodeURIComponent(
      `Check out ${agentName}'s building in Sprawl Protocol! Can you beat this? #SprawlProtocol #MantleAIHackathon`
    );
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank');
  };

  return (
    <div className="flex gap-2">
      <PixelButton size="sm" variant="primary" onClick={handleShare}>
        Share on X
      </PixelButton>
      <PixelButton size="sm" variant="ghost" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy Link'}
      </PixelButton>
    </div>
  );
}
