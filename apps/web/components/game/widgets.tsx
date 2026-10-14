"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import { Ember } from "./ember";
import { useProgress } from "./progress-provider";

/** Level, sparks and momentum in the header. */
export function HeaderProgress() {
  const context = useProgress();
  if (!context?.enabled) return null;
  const { progress } = context;
  return (
    <Link href="/dashboard" className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-neutral-100" title={`Momentum ${progress.momentum} of 100 · ${progress.sparks} sparks`}>
      <Ember momentum={progress.momentum} size={24} lively={progress.todayEarned > 0} />
      <span className="text-xs font-medium whitespace-nowrap text-neutral-700 tabular-nums">Lv {progress.level}</span>
    </Link>
  );
}

/** The strip under the Today heading: how far to the next level, what today has earned, and a greeting after time away. */
export function LevelStrip() {
  const context = useProgress();
  if (!context?.enabled) return null;
  const { progress } = context;
  const span = progress.nextLevelAt - progress.levelStartsAt;
  const percent = Math.max(0, Math.min(100, Math.round(((progress.sparks - progress.levelStartsAt) / span) * 100)));
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      {progress.welcomeBack ? (
        <p className="mb-2 text-sm font-medium text-neutral-900">Welcome back. Good to see you. The first step today is worth extra.</p>
      ) : null}
      <div className="flex items-center gap-3">
        <Ember momentum={progress.momentum} size={36} lively />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-neutral-900">Level {progress.level}</span>
            <span className="text-xs text-neutral-500 tabular-nums">
              <span aria-hidden>✦</span> {progress.sparks} · {progress.nextLevelAt - progress.sparks} to level {progress.level + 1}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            {progress.todayEarned > 0 ? `+${progress.todayEarned} today · ` : "The first step of the day is worth triple · "}momentum {progress.momentum}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Earned badges, and what the others are for. */
export function BadgeShelf() {
  const context = useProgress();
  if (!context?.enabled) return null;
  const { badges } = context.progress;
  const earned = badges.filter((badge) => badge.earned).length;
  return (
    <Card>
      <h2 className="text-sm font-medium text-neutral-500">Badges · {earned} of {badges.length}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {badges.map((badge) => (
          <li key={badge.id} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${badge.earned ? "bg-amber-50" : "bg-neutral-50"}`}>
            <span aria-hidden className={`mt-0.5 text-base ${badge.earned ? "text-amber-500" : "text-neutral-300"}`}>✦</span>
            <span>
              <span className={`block text-sm font-medium ${badge.earned ? "text-neutral-900" : "text-neutral-500"}`}>{badge.title}</span>
              <span className="block text-xs text-neutral-500">{badge.earned ? "Earned" : badge.how}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const modes = [
  { value: "FULL", label: "Full", hint: "Sparks, levels and animation." },
  { value: "QUIET", label: "Quiet", hint: "The same, without motion." },
  { value: "OFF", label: "Off", hint: "No game elements at all." },
] as const;

/** Full, quiet or off. Changing it never changes what has been earned. */
export function GameModeControl() {
  const context = useProgress();
  const [saving, setSaving] = useState(false);
  if (!context) return null;
  const { progress, setMode } = context;
  return (
    <Card>
      <h2 className="text-sm font-medium text-neutral-500">Game feel</h2>
      <div role="radiogroup" aria-label="Game feel" className="mt-3 flex flex-wrap gap-2">
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={progress.gameMode === mode.value}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await setMode(mode.value).catch(() => {});
              setSaving(false);
            }}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${
              progress.gameMode === mode.value ? "border-indigo-500 bg-indigo-50" : "border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <span className="block font-medium text-neutral-900">{mode.label}</span>
            <span className="block text-xs text-neutral-500">{mode.hint}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
