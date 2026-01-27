import { useState } from 'react';
import ColorTrains from '../../games/colorTrains/ColorTrains';
import GameInstructions from '../../components/GameInstructions/GameInstructions';

export default function ColorTrainsPage() {
  const [showInstructions, setShowInstructions] = useState(true);

  if (showInstructions) {
    return (
      <GameInstructions
        gameName="רכבות הצבעים"
        onStart={() => setShowInstructions(false)}
      />
    );
  }

  return <ColorTrains />;
}