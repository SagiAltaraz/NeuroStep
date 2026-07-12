/**
 * TrainingTimer — the recommended play-time countdown, shown as a prominent card
 * BELOW the game (not on the companion avatar) so the mascot is free to give
 * feedback pushes during play. The recommended length (5–15 min, per the
 * player's level in the game's cognitive category) comes from the chat-session
 * recommendation.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMyChatSessionRecommendation, isApiError } from '../../api/me';
import { getStoredChatSessionId } from '../chat-assistant/chatSessionStorage';
import { useLang } from '../../context/LanguageContext';
import './TrainingTimer.css';

export default function TrainingTimer() {
  const { token } = useAuth();
  const { t } = useLang();
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    const sessionId = getStoredChatSessionId();
    if (!sessionId) return;
    let cancelled = false;
    getMyChatSessionRecommendation(token, sessionId).then((r) => {
      if (!cancelled && !isApiError(r) && r.recommendedSessionLengthMin !== null) {
        setTotalSeconds(r.recommendedSessionLengthMin * 60);
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (totalSeconds === null) return;
    setSeconds(totalSeconds);
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) { window.clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [totalSeconds]);

  if (seconds === null || totalSeconds === null) return null;

  const label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const remaining = totalSeconds > 0 ? seconds / totalSeconds : 0;
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
