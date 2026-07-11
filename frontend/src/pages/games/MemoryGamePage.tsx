import { useState } from 'react';
import MemoryGameInstructions from '../../components/game-instructions/MemoryGameInstructions';
import Memory from '../../games/memory/Memory';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function MemoryGamePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('memory');

  if (showInstructions) {
    return <MemoryGameInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <Memory
        onAction={sendEvent}
        adjustment={adjustment ?? undefined}
        onExit={handleExit}
      />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
