import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function WhereWasItInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="whereWasIt" onStart={onStart} />;
}
