import { useState } from 'react';
import ColorTrains from '../../games/color-trains/ColorTrains';
import ColorTrainsInstructions from '../../components/game-instructions/ColorTrainsInstructions';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import TrainingTimer from '../../components/ui/TrainingTimer';
import SessionResults from '../../components/ui/SessionResults';

export default function ColorTrainsPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('color-trains');

  if (showInstructions) {
    return <ColorTrainsInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <ColorTrains onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <TrainingTimer />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
