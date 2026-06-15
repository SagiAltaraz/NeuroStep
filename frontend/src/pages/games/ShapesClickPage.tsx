import { useState } from 'react';
import ShapesClickInstructions from '../../components/game-instructions/ShapesClickInstructions';
import ShapesClick from '../../games/shapes-click/ShapesClick';
import { useGameSession } from '../../hooks/useGameSession';
import CoachingToast from '../../components/ui/CoachingToast';
import AdaptiveDebugHUD from '../../components/ui/AdaptiveDebugHUD';
import SessionResults from '../../components/ui/SessionResults';

export default function ShapesClickPage() {
  const [showInstructions, setShowInstructions] = useState(true);
  const { sendEvent, adjustment, coachingMessage, isConnected, telemetry, lastAdjustment, endSession, sessionResult } =
    useGameSession('shapes-click');

  if (showInstructions) {
    return <ShapesClickInstructions onStart={() => setShowInstructions(false)} />;
  }

  return (
    <>
      <ShapesClick onAction={sendEvent} adjustment={adjustment ?? undefined} />
      <CoachingToast message={coachingMessage} />
      <SessionResults result={sessionResult} onFinish={endSession} />
      {/* Diagnostic overlay — only in local dev, never shown to real users. */}
      {import.meta.env.DEV && (
        <AdaptiveDebugHUD isConnected={isConnected} telemetry={telemetry} lastAdjustment={lastAdjustment} />
      )}
    </>
  );
}
