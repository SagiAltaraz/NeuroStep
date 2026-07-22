import { useState } from 'react';
import ShapesClickInstructions from '../../components/game-instructions/ShapesClickInstructions';
import ShapesClick from '../../games/shapes-click/ShapesClick';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import TrainingTimer from '../../components/ui/TrainingTimer';
import SessionResults from '../../components/ui/SessionResults';

export default function ShapesClickPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult, isConnected } =
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
      {!isConnected && (
        <div
          dir="rtl"
          className="fixed bottom-4 right-4 z-40 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200"
          role="status"
        >
          ⚠️ מנוע ההתאמה מנותק — המשחק רץ ללא שינוי רמה בזמן אמת
        </div>
      )}
      <CoachingToast message={coachingMessage} />
      <TrainingTimer gameKey="shapesClick" />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
