import GameInstructionsView from './GameInstructionsView';

interface Props { onStart: () => void; }

export default function FindLetterInstructions({ onStart }: Props) {
  return <GameInstructionsView gameId="findLetter" onStart={onStart} />;
}
