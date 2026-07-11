import { useState } from 'react';
import FindLetterInstructions from '../../components/game-instructions/FindLetterInstructions';
import FindLetter from '../../games/find-letter/FindLetter';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function FindLetterPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('find-letter');

  if (showInstructions) {
    return <FindLetterInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <FindLetter onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
