import { useState } from 'react';
import ColorTrains from '../../games/color-trains/ColorTrains';
import ColorTrainsInstructions from '../../components/game-instructions/ColorTrainsInstructions';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
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
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
