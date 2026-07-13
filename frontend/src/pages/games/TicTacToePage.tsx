import { useState } from 'react';
import TicTacToeInstructions from '../../components/game-instructions/TicTacToeInstructions';
import TicTacToe from '../../games/tic-tac-toe/TicTacToe';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import TrainingTimer from '../../components/ui/TrainingTimer';
import SessionResults from '../../components/ui/SessionResults';

export default function TicTacToePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const [exiting, setExiting] = useState(false);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('tictactoe');

  if (showInstructions) {
    return <TicTacToeInstructions onStart={() => setShowInstructions(false)} />;
  }

  // The in-game back button ends the session and shows the results overlay.
  // Any other exit is finalized server-side on disconnect, so progress is safe.
  const handleExit = () => { setExiting(true); endSession(); };

  return (
    <>
      <TicTacToe
        onAction={sendEvent}
        adjustment={adjustment ?? undefined}
        onExit={handleExit}
      />
      <CoachingToast message={coachingMessage} />
      <TrainingTimer gameKey="ticTacToe" />
      <SessionResults result={sessionResult} active={exiting} />
    </>
  );
}
