import { useState } from 'react';
import FindLetterInstructions from '../../components/game-instructions/FindLetterInstructions';
import FindLetter from '../../games/find-letter/FindLetter';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import RecommendedTimeBar from '../../components/ui/RecommendedTimeBar';
import SessionResults from '../../components/ui/SessionResults';

export default function FindLetterPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, endSession, sessionResult } = useGameSession('find-letter');

  if (showInstructions) {
    return <FindLetterInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <FindLetter onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
      <RecommendedTimeBar gameId="find-letter" />
      <SessionResults result={sessionResult} onFinish={endSession} />
    </>
  );
}
