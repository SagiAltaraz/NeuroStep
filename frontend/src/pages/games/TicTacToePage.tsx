import { useState } from 'react';
import TicTacToeInstructions from '../../components/game-instructions/TicTacToeInstructions';
import TicTacToe from '../../games/tic-tac-toe/TicTacToe';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';

export default function TicTacToePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage } = useGameSession('tictactoe');

  if (showInstructions) {
    return <TicTacToeInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <TicTacToe
        onAction={sendEvent}
        adjustment={adjustment ?? undefined}
      />
      <CoachingToast message={coachingMessage} />
    </>
  );
}
