import { useState } from 'react';
import SpotDifferenceInstructions from '../../components/game-instructions/SpotDifferenceInstructions';
import SpotDifference from '../../games/spot-difference/SpotDifference';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function SpotDifferencePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('spot-difference');

  if (showInstructions) {
    return <SpotDifferenceInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <SpotDifference onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
