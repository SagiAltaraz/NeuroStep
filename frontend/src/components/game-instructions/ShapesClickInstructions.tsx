import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function ShapesClickInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="shapesClick" onStart={onStart} />;
}
