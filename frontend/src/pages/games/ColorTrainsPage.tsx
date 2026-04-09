import { useState } from 'react';
import ColorTrains from '../../games/color-trains/ColorTrains';
import ColorTrainsInstructions from '../../components/game-instructions/ColorTrainsInstructions';
import { useGameSession } from '../../hooks/useGameSession';

export default function ColorTrainsPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment } = useGameSession('color-trains');

  if (showInstructions) {
    return <ColorTrainsInstructions onStart={() => setShowInstructions(false)} />;
  }

  return <ColorTrains onAction={sendEvent} adjustment={adjustment ?? undefined} />;
}
