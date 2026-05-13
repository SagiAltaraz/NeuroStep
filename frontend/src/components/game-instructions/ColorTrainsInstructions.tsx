import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function ColorTrainsInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="colorTracking" onStart={onStart} />;
}
