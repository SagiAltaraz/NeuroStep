/**
 * TrainingTimer — the recommended play-time countdown, shown as a prominent card
 * BELOW the game (not on the companion avatar) so the mascot is free to give
 * feedback pushes during play.
 *
 * It uses the SAME per-game recommended minutes shown on the instructions page
 * (GAME_RECOMMENDED_MINUTES), so the two always match. It never stops the game —
 * when the recommended time is up it just congratulates the player on the effort
 * and invites them to keep going if they want.
 */
import { useEffect, useState } from 'react';
import { GAME_RECOMMENDED_MINUTES } from '../../data/gameInstructions';
import { useLang } from '../../context/LanguageContext';
import './TrainingTimer.css';

interface Props {
  /** The GAME_INSTRUCTIONS key (e.g. "colorTracking") — matches the instructions page. */
  gameKey: string;
}

export default function TrainingTimer({ gameKey }: Props) {
  const { t } = useLang();
  const minutes = GAME_RECOMMENDED_MINUTES[gameKey];
  const [seconds, setSeconds] = useState<number | null>(
    minutes != null ? minutes * 60 : null,
  );

  useEffect(() => {
    if (minutes == null) return;
    setSeconds(minutes * 60);
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) { window.clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [minutes]);

  if (minutes == null || seconds === null) return null;

  const total = minutes * 60;

  // Time's up → congratulate, don't stop the game; invite them to keep playing.
  if (seconds <= 0) {
    return (
      <div className="training-timer training-timer--done" role="status">
        <span className="training-timer__icon" aria-hidden="true">🎉</span>
        <span className="training-timer__done-text">{t('training.timer.done')}</span>
      </div>
    );
  }

  const label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const remaining = total > 0 ? seconds / total : 0;
  const low = remaining <= 0.2;

  return (
    <div className={`training-timer${low ? ' training-timer--low' : ''}`} role="timer"
         aria-label={`${t('companion.game.timeRemaining')} ${label}`}>
      <div className="training-timer__row">
        <span className="training-timer__icon" aria-hidden="true">⏱</span>
        <span className="training-timer__label">{t('training.timer.label')}</span>
        <span className="training-timer__time">{label}</span>
      </div>
      <div className="training-timer__bar">
        <div className="training-timer__fill" style={{ width: `${Math.round(remaining * 100)}%` }} />
      </div>
    </div>
  );
}
