import { useState } from 'react';
import ShapesClickInstructions from '../../components/game-instructions/ShapesClickInstructions';
import ShapesClick from '../../games/shapes-click/ShapesClick';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function ShapesClickPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } =
    useGameSession('shapes-click');

  if (showInstructions) {
    return <ShapesClickInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay
  // (the level-up moment). Any other exit — navigation, tab close — is
  // finalized server-side on disconnect, so progress is never lost.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <ShapesClick onAction={sendEvent} adjustment={adjustment ?? undefined} onExit={handleExit} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
