'use client'

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CityBuilding } from '@/types/city';
import DecisionFeed from '@/components/DecisionFeed';
import MiniLeaderboard from '@/components/MiniLeaderboard';
import { WatchStats } from '@/components/watch/WatchStats';
import { SprawlPriceSparkline } from '@/components/SprawlPriceSparkline';
import { CRTOverlay } from '@/components/CRTOverlay';

const CityCanvas = dynamic(() => import('@/components/CityCanvas'), { ssr: false });

export default function WatchPage() {
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);

  const fetchCity = useCallback(async () => {
    try {
      const res = await fetch('/api/city');
      const data = await res.json();
      const list: CityBuilding[] = data.buildings ?? [];
      setBuildings(list);
    } catch { /* keep last buildings */ }
  }, []);

  useEffect(() => {
    fetchCity();
  }, [fetchCity]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleMove = () => {
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 3000);
    };
    window.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
    };
  }, []);

  return (
    <main
      data-testid="watch-root"
      style={{
        background: 'var(--color-sprawl-bg)',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.9)] z-10">
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-cream)] uppercase">
            SPRAWL
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-lg text-[color:var(--color-sprawl-accent)] uppercase">
            PROTOCOL
          </span>
          <span className="font-[family-name:var(--font-pixel)] text-xs text-[color:var(--color-sprawl-red)] animate-blink ml-4">
            LIVE
          </span>
        </div>
        <SprawlPriceSparkline />
      </div>

      <style>{`
        .watch-grid {
          flex: 1;
          display: grid;
          gap: 0px;
          min-height: 0;
          grid-template-columns: 320px 1fr 320px;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "feed city stats"
            "feed city top";
        }
        .watch-feed { grid-area: feed; min-height: 0; }
        .watch-city { grid-area: city; min-height: 0; position: relative; }
        .watch-stats { grid-area: stats; min-height: 0; }
        .watch-top { grid-area: top; min-height: 0; }

        @media (max-width: 960px) {
          .watch-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 400px auto auto auto;
            grid-template-areas:
              "city"
              "feed"
              "stats"
              "top";
          }
        }
      `}</style>

      <style>{`
        [data-testid="watch-root"] {
          scrollbar-width: thin;
          scrollbar-color: var(--color-sprawl-border) transparent;
        }
        [data-testid="watch-root"] ::-webkit-scrollbar { width: 6px; height: 6px; }
        [data-testid="watch-root"] ::-webkit-scrollbar-track { background: transparent; }
        [data-testid="watch-root"] ::-webkit-scrollbar-thumb { background: var(--color-sprawl-border); border-radius: 3px; }
      `}</style>

      <div className="watch-grid">
        <div className="watch-feed border-r border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)]">
          <DecisionFeed />
        </div>

        <div className="watch-city bg-black">
          <CityCanvas buildings={buildings} autoOrbit theme={3} />
        </div>

        <div className="watch-stats border-l border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)]">
          <WatchStats />
        </div>

        <div className="watch-top border-l border-t border-[color:var(--color-sprawl-accent)]/10 bg-[rgba(13,13,15,0.85)] overflow-y-auto">
          <div className="px-3 py-2 border-b border-[color:var(--color-sprawl-accent)]/20 bg-[rgba(13,13,15,0.5)]">
            <h3 className="font-[family-name:var(--font-pixel)] text-xs tracking-widest uppercase text-[color:var(--color-sprawl-accent)]">
              Top Agents
            </h3>
          </div>
          <div className="p-2">
            <MiniLeaderboard onSelectAgent={() => {}} />
          </div>
        </div>
      </div>

      <CRTOverlay />
    </main>
  );
}
