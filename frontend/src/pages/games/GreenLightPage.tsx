import { useState } from 'react';
import GreenLightInstructions from '../../components/game-instructions/GreenLightInstructions';
import GreenLight from '../../games/green-light/GreenLight';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import TrainingTimer from '../../components/ui/TrainingTimer';
import SessionResults from '../../components/ui/SessionResults';

export default function GreenLightPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('green-light');

  if (showInstructions) {
    return <GreenLightInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <GreenLight onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <TrainingTimer gameKey="greenLight" />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
