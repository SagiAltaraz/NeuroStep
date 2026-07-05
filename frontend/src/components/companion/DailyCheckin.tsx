/**
 * DailyCheckin — a once-a-day "how do you feel / did you sleep" prompt from the
 * companion. Renders a small card near the mascot; the answer is POSTed to
 * /api/me/checkin and read by the game-server's adaptive warm-up (a tired or
 * poorly-slept day opens the difficulty a touch easier). Self-contained so it
 * never touches the companion's flight/message state machine.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './DailyCheckin.css';

type Mood = 'good' | 'ok' | 'tired';
type Sleep = 'well' | 'ok' | 'bad';
type Status = 'hidden' | 'ask' | 'done';

const MOODS: { value: Mood; label: string }[] = [
  { value: 'good',  label: '😊 טוב' },
  { value: 'ok',    label: '🙂 סביר' },
  { value: 'tired', label: '😴 עייף' },
];

const SLEEPS: { value: Sleep; label: string }[] = [
  { value: 'well', label: '👍 כן' },
  { value: 'ok',   label: '😐 ככה-ככה' },
  { value: 'bad',  label: '😕 לא ממש' },
];

export default function DailyCheckin() {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>('hidden');
  const [step, setStep]     = useState<'mood' | 'sleep'>('mood');
  const [mood, setMood]     = useState<Mood | null>(null);
  const [busy, setBusy]     = useState(false);

  // Ask only if the user hasn't checked in today (and is logged in).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/me/checkin/today', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((today) => { if (!cancelled && today == null) setStatus('ask'); })
      .catch(() => {/* stay hidden on error — never nag */});
    return () => { cancelled = true; };
  }, [token]);

  const pickMood = (m: Mood) => { setMood(m); setStep('sleep'); };

  const pickSleep = async (sleep: Sleep) => {
    if (!token || !mood || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/me/checkin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ mood, sleep }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('done');
      setTimeout(() => setStatus('hidden'), 2600);
    } catch {
      // On failure just close — the prompt returns next visit.
      setStatus('hidden');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'hidden') return null;

  return (
    <div className="daily-checkin" dir="rtl" role="dialog" aria-label="צ׳ק-אין יומי">
      {status === 'done' ? (
        <p className="daily-checkin-thanks">תודה! שיהיה אימון נעים 💪</p>
      ) : (
        <>
          <button
            className="daily-checkin-close"
            onClick={() => setStatus('hidden')}
            aria-label="סגור"
          >
            ×
          </button>
          {step === 'mood' ? (
            <>
              <p className="daily-checkin-q">בוקר טוב! איך אתה מרגיש היום?</p>
              <div className="daily-checkin-opts">
                {MOODS.map((o) => (
                  <button key={o.value} className="daily-checkin-opt" onClick={() => pickMood(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="daily-checkin-q">ישנת טוב הלילה?</p>
              <div className="daily-checkin-opts">
                {SLEEPS.map((o) => (
                  <button
                    key={o.value}
                    className="daily-checkin-opt"
                    onClick={() => pickSleep(o.value)}
                    disabled={busy}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
