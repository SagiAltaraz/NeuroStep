import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { GameId } from '../../types/game.types';

/**
 * RecommendedTimeBar — a slim session-length meter overlaid on any game.
 *
 * Fetches the caller's recommended play time for this game (adapted to their
 * ability — weaker domains get a longer target), then fills a progress bar as
 * the session runs. On reaching the target it swaps to a calm positive signal;
 * it never forces the player to stop — just marks "you've done a good stint".
 */
export default function RecommendedTimeBar({ gameId }: { gameId: GameId }) {
  const { token } = useAuth();
  const [targetMin, setTargetMin] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [reached, setReached] = useState(false);
  const startRef = useRef<number>(Date.now());

  // Fetch the per-game target once.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/me/target-time/${gameId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && typeof d?.targetMinutes === 'number') setTargetMin(d.targetMinutes);
      })
      .catch(() => {/* non-fatal — the bar just stays hidden */});
    return () => { cancelled = true; };
  }, [gameId, token]);

  // Tick every second while mounted.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Fire the positive signal once, when the target is first reached.
  useEffect(() => {
    if (targetMin != null && !reached && elapsedSec >= targetMin * 60) setReached(true);
  }, [elapsedSec, targetMin, reached]);

  if (targetMin == null) return null;

  const targetSec    = targetMin * 60;
  const pct          = Math.min(100, Math.round((elapsedSec / targetSec) * 100));
  const remainingMin = Math.max(0, Math.ceil((targetSec - elapsedSec) / 60));

  return (
    <div
      dir="rtl"
      role="status"
      aria-label={reached ? 'הגעת לזמן המשחק המומלץ' : `זמן משחק מומלץ: ${targetMin} דקות`}
      className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-md ring-1 ring-slate-200 backdrop-blur"
    >
      {reached ? (
        <span className="text-sm font-semibold text-green-700 motion-safe:animate-pulse">
          ✓ הגעת לזמן המומלץ! אפשר להמשיך או לסיים 🎉
        </span>
      ) : (
        <>
          <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
            זמן מומלץ
          </span>
          <span className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
            <span
              className="block h-full rounded-full bg-blue-500 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-xs text-slate-500">
            עוד ~{remainingMin} דק׳
          </span>
        </>
      )}
    </div>
  );
}
