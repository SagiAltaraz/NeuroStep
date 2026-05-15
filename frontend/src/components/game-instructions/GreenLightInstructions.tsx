import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function GreenLightInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="greenLight" onStart={onStart} />;
}
