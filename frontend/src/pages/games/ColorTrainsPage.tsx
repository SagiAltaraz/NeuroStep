import { useState } from 'react';
import ColorTrains from '../../games/color-trains/ColorTrains';
import ColorTrainsInstructions from '../../components/game-instructions/ColorTrainsInstructions';

export default function ColorTrainsPage() {
  const [showInstructions, setShowInstructions] = useState(true);

  if (showInstructions) {
    return <ColorTrainsInstructions onStart={() => setShowInstructions(false)} />;
  }

  return <ColorTrains />;
}
