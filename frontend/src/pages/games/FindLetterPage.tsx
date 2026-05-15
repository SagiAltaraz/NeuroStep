import { useState } from 'react';
import FindLetterInstructions from '../../components/game-instructions/FindLetterInstructions';
import FindLetter from '../../games/find-letter/FindLetter';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';

export default function FindLetterPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage } = useGameSession('find-letter');

  if (showInstructions) {
    return <FindLetterInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <FindLetter onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
    </>
  );
}
