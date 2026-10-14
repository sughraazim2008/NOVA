/**
 * Ember: the flame that stands for momentum, and NOVA's companion. It is brighter and larger the
 * more momentum there is, and it is always pleased to see you. It has no sad, hungry or neglected
 * state on purpose (docs/game-layer.md).
 */
export function Ember({ momentum, size = 28, lively = false }: { momentum: number; size?: number; lively?: boolean }) {
  const strength = Math.max(0, Math.min(1, momentum / 100));
  const scale = 0.78 + strength * 0.22;
  const glow = 0.25 + strength * 0.6;
  // Eyes curve into happy arcs once there is real momentum.
  const beaming = momentum >= 50;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={`Momentum ${momentum} out of 100`} className="shrink-0 overflow-visible">
      <circle cx="16" cy="19" r="13" fill="#fb923c" opacity={glow * 0.35} />
      <g className={lively ? "nova-flicker" : undefined} style={{ transformBox: "fill-box" }}>
        <g transform={`translate(16 28) scale(${scale}) translate(-16 -28)`}>
          <path d="M16 2c1 5 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 2 2 3 3 3 0-4 1-7 2-10z" fill="#f97316" />
          <path d="M16 12c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-5 0 1 1 2 1 2 0-2 0-3 1-5z" fill="#fde047" />
          {beaming ? (
            <>
              <path d="M12.6 19.4q1.2-1.4 2.4 0" fill="none" stroke="#7c2d12" strokeWidth="1" strokeLinecap="round" />
              <path d="M17 19.4q1.2-1.4 2.4 0" fill="none" stroke="#7c2d12" strokeWidth="1" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="13.8" cy="19" r="0.95" fill="#7c2d12" />
              <circle cx="18.2" cy="19" r="0.95" fill="#7c2d12" />
            </>
          )}
          <path d="M14 21.6q2 1.7 4 0" fill="none" stroke="#7c2d12" strokeWidth="1" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
