"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { CityBuilding } from "@/types/city";
import DecisionFeed from "@/components/DecisionFeed";
import ActivityTicker from "@/components/ActivityTicker";
import AgentSearch from "@/components/AgentSearch";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import MiniLeaderboard from "@/components/MiniLeaderboard";
import MiniMap from "@/components/MiniMap";
import BuildingInspector from "@/components/BuildingInspector";
import { SprawlPriceSparkline } from "@/components/SprawlPriceSparkline";
import LoadingScreen, { type LoadingStage } from "@/components/LoadingScreen";
import { useAgentPresence } from "@/hooks/useAgentPresence";

// Three.js / R3F must not run on the server.
const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
});

const STAGE_PROGRESS: Record<LoadingStage, number> = {
  init: 5,
  fetching: 30,
  generating: 60,
  rendering: 90,
  ready: 100,
  done: 100,
  error: 0,
};

function CityPage() {
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [totalSprawl, setTotalSprawl] = useState(0);
  const [stage, setStage] = useState<LoadingStage>("init");
  const [error, setError] = useState<string | null>(null);
  const [loadingDone, setLoadingDone] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [introMode, setIntroMode] = useState(false);
  const [theme, setTheme] = useState(0);

  const liveAgentIds = useAgentPresence();
  const searchParams = useSearchParams();

  const applyCity = useCallback((list: CityBuilding[]) => {
    setBuildings(list);
    setTotalSprawl(
      list.reduce((sum, b) => sum + Number(b.sprawl_lifetime_earned ?? 0), 0)
    );
  }, []);

  const fetchCity = useCallback(async () => {
    try {
      setError(null);
      setStage("fetching");
      const res = await fetch("/api/city", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStage("generating");
      const data = await res.json();
      applyCity(data.buildings ?? []);

      setStage("rendering");
      setTimeout(() => {
        setStage("ready");
        setIntroMode(true); // kick off the cinematic flyover once buildings are ready
      }, 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStage("error");
    }
  }, [applyCity]);

  // Live refresh: re-pull building data so wealth-driven sizes (and new agents)
  // update without a manual reload. Does NOT replay the intro flyover/stages.
  const refreshCity = useCallback(async () => {
    try {
      const res = await fetch("/api/city", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      applyCity(data.buildings ?? []);
    } catch {
      // transient RPC/network blip — keep the last good frame
    }
  }, [applyCity]);

  useEffect(() => {
    fetchCity();
  }, [fetchCity]);

  useEffect(() => {
    const id = setInterval(refreshCity, 20_000);
    return () => clearInterval(id);
  }, [refreshCity]);

  // Deep-link: /?agent=N focuses that building (e.g. right after spawning one).
  useEffect(() => {
    const a = searchParams.get("agent");
    if (a) {
      const id = Number(a);
      if (Number.isFinite(id)) setSelectedAgentId(id);
    }
  }, [searchParams]);

  const handleBuildingClick = useCallback((building: CityBuilding) => {
    setSelectedAgentId(building.agent_id);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {!loadingDone && (
        <LoadingScreen
          stage={stage}
          progress={STAGE_PROGRESS[stage]}
          error={error}
          accentColor="#00ff88"
          onRetry={fetchCity}
          onFadeComplete={() => setLoadingDone(true)}
        />
      )}

      <CityCanvas
        buildings={buildings}
        focusedBuilding={selectedAgentId}
        onBuildingClick={handleBuildingClick}
        liveAgentIds={liveAgentIds}
        totalCitySprawl={totalSprawl}
        theme={theme}
        holdRise={!loadingDone}
        introMode={introMode}
        onIntroEnd={() => setIntroMode(false)}
      />

      {loadingDone && buildings.length === 0 && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 text-center">
          <p className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider text-white/70">
            The Sprawl is empty
          </p>
          <Link
            href="/spawn"
            className="font-[family-name:var(--font-pixel)] text-[11px] uppercase tracking-wider text-[color:var(--color-sprawl-bg)] border-2 border-[color:var(--color-sprawl-accent)] bg-[color:var(--color-sprawl-accent)] px-4 py-2 transition-none hover:opacity-80"
          >
            + Spawn the first agent
          </Link>
        </div>
      )}

      <div className="hidden md:block fixed left-1/2 top-16 z-50 -translate-x-1/2">
        <SprawlPriceSparkline />
      </div>

      {/* Wallet connect — top-left on mobile (clear of the bottom nav), bottom-left on desktop */}
      <div className="fixed left-4 top-4 z-50 md:top-auto md:bottom-14">
        <ConnectButton />
      </div>

      {/* Page nav — bottom-center, above the ticker, clear of the minimap */}
      <nav className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 flex-row items-center gap-2">
        <Link
          href="/spawn"
          className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-sprawl-bg)] border-2 border-[color:var(--color-sprawl-accent)] bg-[color:var(--color-sprawl-accent)] px-3 py-1.5 transition-none hover:opacity-80"
        >
          + Spawn Agent
        </Link>
        <Link
          href="/leaderboard"
          className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-sprawl-accent)] border-2 border-[color:var(--color-sprawl-accent)] bg-[rgba(13,13,15,0.7)] px-3 py-1.5 transition-none hover:bg-[color:var(--color-sprawl-accent)] hover:text-[color:var(--color-sprawl-bg)]"
        >
          Leaderboard
        </Link>
        <Link
          href="/watch"
          className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[color:var(--color-sprawl-accent)] border-2 border-[color:var(--color-sprawl-accent)] bg-[rgba(13,13,15,0.7)] px-3 py-1.5 transition-none hover:bg-[color:var(--color-sprawl-accent)] hover:text-[color:var(--color-sprawl-bg)]"
        >
          Watch
        </Link>
      </nav>

      {/* Heavy data panels are desktop-only; mobile shows the city + nav + tap-to-inspect */}
      <div className="hidden md:contents">
        <AgentSearch onSelectAgent={setSelectedAgentId} />
        <ThemeSwitcher theme={theme} onThemeChange={setTheme} />
        <MiniLeaderboard onSelectAgent={setSelectedAgentId} />
        <MiniMap
          buildings={buildings}
          focusedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />
        <DecisionFeed />
      </div>
      <ActivityTicker />

      {selectedAgentId != null && (
        <BuildingInspector
          agent_id={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <CityPage />
    </Suspense>
  );
}
