import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function TicTacToeInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="ticTacToe" onStart={onStart} />;
}
