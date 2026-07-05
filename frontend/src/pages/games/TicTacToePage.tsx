import { useState } from 'react';
import TicTacToeInstructions from '../../components/game-instructions/TicTacToeInstructions';
import TicTacToe from '../../games/tic-tac-toe/TicTacToe';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import RecommendedTimeBar from '../../components/ui/RecommendedTimeBar';
import SessionResults from '../../components/ui/SessionResults';

export default function TicTacToePage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('tictactoe');

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
      <RecommendedTimeBar gameId="tictactoe" />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
