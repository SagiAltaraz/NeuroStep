import { useState } from 'react';
import GreenLightInstructions from '../../components/game-instructions/GreenLightInstructions';
import GreenLight from '../../games/green-light/GreenLight';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function GreenLightPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('green-light');

  if (showInstructions) {
    return <GreenLightInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <GreenLight onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
