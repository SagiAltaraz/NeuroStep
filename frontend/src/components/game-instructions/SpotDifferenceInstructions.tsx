import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function SpotDifferenceInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="spotDifference" onStart={onStart} />;
}
