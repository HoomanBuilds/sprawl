"use client";

import { useEffect, useRef } from "react";

const THEMES = [
  { name: "Emerald", color: "#00ff88" },
  { name: "Midnight", color: "#4a6cf7" },
  { name: "Sunset", color: "#ff7a45" },
  { name: "Neon", color: "#ff00ff" },
  { name: "Sunrise", color: "#ff9050" },
  { name: "Daylight", color: "#7cb9e8" },
] as const;

const STORAGE_KEY = "sprawl.theme";

interface Props {
  theme: number;
  onThemeChange: (i: number) => void;
}

export default function ThemeSwitcher({ theme, onThemeChange }: Props) {
  const hydrated = useRef(false);

  // Restore the persisted theme on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= 0 && n < THEMES.length && n !== theme) {
          onThemeChange(n);
        }
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(i: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(i));
    } catch {
      // ignore persistence failures
    }
    onThemeChange(i);
  }

  return (
    <div className="fixed right-4 top-4 z-[60] flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/80 px-2 py-1.5 backdrop-blur-sm">
      {THEMES.map((t, i) => {
        const active = i === theme;
        return (
          <button
            key={t.name}
            onClick={() => select(i)}
            title={t.name}
            aria-label={`${t.name} theme`}
            aria-pressed={active}
            className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
              active
                ? "border-white scale-110"
                : "border-white/20 opacity-60 hover:opacity-100"
            }`}
            style={{
              backgroundColor: t.color,
              boxShadow: active ? `0 0 8px ${t.color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
