"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { CityBuilding } from "@/types/city";
import Providers from "@/components/Providers";
import DecisionFeed from "@/components/DecisionFeed";
import BuildingInspector from "@/components/BuildingInspector";
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

  const liveAgentIds = useAgentPresence();

  const fetchCity = useCallback(async () => {
    try {
      setError(null);
      setStage("fetching");
      const res = await fetch("/api/city");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStage("generating");
      const data = await res.json();
      const list: CityBuilding[] = data.buildings ?? [];
      setBuildings(list);
      setTotalSprawl(
        list.reduce((sum, b) => sum + Number(b.sprawl_lifetime_earned ?? 0), 0)
      );

      setStage("rendering");
      setTimeout(() => setStage("ready"), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    fetchCity();
  }, [fetchCity]);

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
      />

      {/* Wallet connect (RainbowKit) */}
      <div className="fixed left-4 bottom-4 z-50">
        <ConnectButton />
      </div>

      <DecisionFeed />

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
    <Providers>
      <CityPage />
    </Providers>
  );
}
