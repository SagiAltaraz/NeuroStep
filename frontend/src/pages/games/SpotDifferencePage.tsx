import { useState } from 'react';
import SpotDifferenceInstructions from '../../components/game-instructions/SpotDifferenceInstructions';
import SpotDifference from '../../games/spot-difference/SpotDifference';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import TrainingTimer from '../../components/ui/TrainingTimer';
import SessionResults from '../../components/ui/SessionResults';

export default function SpotDifferencePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('spot-difference');

  if (showInstructions) {
    return <SpotDifferenceInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <SpotDifference onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <TrainingTimer />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
