import { useState } from 'react';
import WhereWasItInstructions from '../../components/game-instructions/WhereWasItInstructions';
import WhereWasIt from '../../games/where-was-it/WhereWasIt';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function WhereWasItPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('where-was-it');

  if (showInstructions) {
    return <WhereWasItInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <WhereWasIt onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
