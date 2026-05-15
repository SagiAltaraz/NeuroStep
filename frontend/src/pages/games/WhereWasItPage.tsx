import { useState } from 'react';
import WhereWasItInstructions from '../../components/game-instructions/WhereWasItInstructions';
import WhereWasIt from '../../games/where-was-it/WhereWasIt';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';

export default function WhereWasItPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage } = useGameSession('where-was-it');

  if (showInstructions) {
    return <WhereWasItInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <WhereWasIt onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
    </>
  );
}
