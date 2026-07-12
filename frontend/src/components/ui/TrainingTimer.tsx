/**
 * TrainingTimer — the recommended play-time countdown, shown BELOW the game
 * (not on the companion avatar) so the mascot is free to give feedback pushes
 * during play. The recommended length (5–15 min, per the player's level in the
 * game's cognitive category) comes from the chat-session recommendation.
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
  const [minutes, setMinutes] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    const sessionId = getStoredChatSessionId();
    if (!sessionId) return;
    let cancelled = false;
    getMyChatSessionRecommendation(token, sessionId).then((r) => {
      if (!cancelled && !isApiError(r) && r.recommendedSessionLengthMin !== null) {
        setMinutes(r.recommendedSessionLengthMin);
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (minutes === null) return;
    setSeconds(minutes * 60);
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) { window.clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [minutes]);

  if (seconds === null) return null;
  const label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="training-timer" role="timer" aria-label={`${t('companion.game.timeRemaining')} ${label}`}>
      <span aria-hidden="true">⏱</span>
      <span>{label}</span>
    </div>
  );
}
