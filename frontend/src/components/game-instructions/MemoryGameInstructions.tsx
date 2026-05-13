import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function MemoryGameInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="memory" onStart={onStart} />;
}
