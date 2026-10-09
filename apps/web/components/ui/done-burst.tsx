/**
 * The moment of reward when something is finished: shown within a frame of the tap, before the
 * server has answered. One reusable piece, so the game layer (Phase 8b) can attach points to it.
 */
export function DoneBurst({ size = 40, label = "Done" }: { size?: number; label?: string }) {
  return (
    <span role="img" aria-label={label} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="nova-ring absolute inset-0 rounded-full bg-emerald-400" aria-hidden />
      <span className="nova-pop relative flex h-full w-full items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </span>
  );
}
