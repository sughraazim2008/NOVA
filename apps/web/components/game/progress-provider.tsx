"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { ProgressView } from "@/server/services/progress";

interface Gain {
  id: number;
  sparks: number;
  levelUp: number | null;
  badges: string[];
}

interface ProgressContext {
  progress: ProgressView;
  /** Whether any game element should be drawn at all. */
  enabled: boolean;
  /** Re-reads progress after something was done, and shows what it earned. */
  refresh: () => Promise<void>;
  setMode: (mode: ProgressView["gameMode"]) => Promise<void>;
}

const Context = createContext<ProgressContext | null>(null);

/** Null outside a provider, so components can be used on screens without the game layer. */
export const useProgress = () => useContext(Context);

/**
 * Holds the game state for the screen and shows each gain the moment it is earned.
 * The numbers come from the server, which derives them from history; nothing is counted here.
 */
export function ProgressProvider({ initial, children }: { initial: ProgressView; children: ReactNode }) {
  const [progress, setProgress] = useState(initial);
  const [gain, setGain] = useState<Gain | null>(null);
  const latest = useRef(initial);
  const counter = useRef(0);
  const enabled = progress.gameMode !== "OFF";

  // Quiet mode is applied with one attribute, so every animation can be switched off in CSS.
  useEffect(() => {
    document.documentElement.dataset.game = progress.gameMode;
    return () => {
      delete document.documentElement.dataset.game;
    };
  }, [progress.gameMode]);

  const refresh = useCallback(async () => {
    try {
      const next = await api<ProgressView>("/progress");
      const before = latest.current;
      latest.current = next;
      setProgress(next);
      const sparks = next.sparks - before.sparks;
      if (sparks > 0 && next.gameMode !== "OFF") {
        const earnedBefore = new Set(before.badges.filter((badge) => badge.earned).map((badge) => badge.id));
        counter.current += 1;
        setGain({
          id: counter.current,
          sparks,
          levelUp: next.level > before.level ? next.level : null,
          badges: next.badges.filter((badge) => badge.earned && !earnedBefore.has(badge.id)).map((badge) => badge.title),
        });
      }
    } catch {
      // The game layer is decoration: if it cannot be read, the app carries on without it.
    }
  }, []);

  const setMode = useCallback(async (gameMode: ProgressView["gameMode"]) => {
    await api("/me", { method: "PATCH", body: { gameMode } });
    latest.current = { ...latest.current, gameMode };
    setProgress((current) => ({ ...current, gameMode }));
  }, []);

  return (
    <Context.Provider value={{ progress, enabled, refresh, setMode }}>
      {children}
      {gain && enabled ? <GainToast key={gain.id} gain={gain} onDone={() => setGain(null)} /> : null}
    </Context.Provider>
  );
}

function GainToast({ gain, onDone }: { gain: Gain; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div
      role="status"
      className="nova-gain pointer-events-none fixed bottom-8 left-1/2 z-50 flex flex-col items-center gap-1 rounded-2xl bg-neutral-900 px-5 py-3 text-white shadow-lg"
    >
      <span className="text-lg font-semibold tabular-nums">
        <span className="text-amber-300" aria-hidden>✦</span> +{gain.sparks}
        <span className="sr-only"> sparks</span>
      </span>
      {gain.levelUp ? <span className="text-sm text-amber-200">Level {gain.levelUp}</span> : null}
      {gain.badges.map((title) => (
        <span key={title} className="text-xs text-neutral-300">New badge: {title}</span>
      ))}
    </div>
  );
}
