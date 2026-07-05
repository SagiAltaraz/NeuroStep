import { useState } from 'react';
import ColorTrains from '../../games/color-trains/ColorTrains';
import ColorTrainsInstructions from '../../components/game-instructions/ColorTrainsInstructions';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import RecommendedTimeBar from '../../components/ui/RecommendedTimeBar';
import SessionResults from '../../components/ui/SessionResults';

export default function ColorTrainsPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('color-trains');

  if (showInstructions) {
    return <ColorTrainsInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <ColorTrains onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
      <RecommendedTimeBar gameId="color-trains" />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
