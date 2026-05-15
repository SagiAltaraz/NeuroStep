import { useState } from 'react';
import GreenLightInstructions from '../../components/game-instructions/GreenLightInstructions';
import GreenLight from '../../games/green-light/GreenLight';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';

export default function GreenLightPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage } = useGameSession('green-light');

  if (showInstructions) {
    return <GreenLightInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <GreenLight onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
    </>
  );
}
