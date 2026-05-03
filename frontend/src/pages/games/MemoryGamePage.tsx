import { useState } from 'react';
import MemoryGameInstructions from '../../components/game-instructions/MemoryGameInstructions';
import Memory from '../../games/memory/Memory';
import { useGameSession } from '../../hooks/useGameSession';

export default function MemoryGamePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment } = useGameSession('memory');

  if (showInstructions) {
    return <MemoryGameInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <Memory
      onAction={sendEvent}
      adjustment={adjustment ?? undefined}
    />
  );
}
