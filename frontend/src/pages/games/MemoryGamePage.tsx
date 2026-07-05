import { useState } from 'react';
import MemoryGameInstructions from '../../components/game-instructions/MemoryGameInstructions';
import Memory from '../../games/memory/Memory';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import SessionResults from '../../components/ui/SessionResults';

export default function MemoryGamePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('memory');

  if (showInstructions) {
    return <MemoryGameInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <Memory
        onAction={sendEvent}
        adjustment={adjustment ?? undefined}
      />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
