// ── TemplatePage — wiring pattern for every NeuroStep game ────────────────────
//
// STEP 1: Replace 'REPLACE_WITH_GAME_ID' with your GameId string.
//         Add that same string to GameId in frontend/src/types/game.types.ts.
//
// STEP 2: Replace TemplateScene with your scene class.
//
// STEP 3: Define your GameConfig object and pass it as `config` below.
//
// STEP 4: Nothing else is needed — the wiring (WebSocket, Kafka, adjustments)
//         is handled entirely by useGameSession and TemplatePage.

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import { TemplateScene } from './TemplateScene';        // STEP 2: your scene
import { useGameSession } from '../../hooks/useGameSession';

// STEP 3: define your game config here
const GAME_CONFIG: Record<string, unknown> = {
  // e.g. reactionWindowMs: 3000, objectCount: 5
};

export default function TemplatePage() {
  const navigate = useNavigate();

  // ── useGameSession wires this page to the backend ────────────────────────────
  // sendEvent  → goes to game-server → written to Kafka "game-events"
  // adjustment → server computed a difficulty change, apply it to the scene
  // sessionId  → unique per page load, included in every event automatically
  // isConnected → useful for a debug/status indicator
  // STEP 1: replace 'shapes-click' with your GameId and add it to game.types.ts
  const { sendEvent, adjustment, isConnected, sessionId } =
    useGameSession('shapes-click' /* STEP 1: replace with your GameId */);

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<TemplateScene | null>(null); // STEP 2: your scene type

  // ── Apply server-sent difficulty adjustment ──────────────────────────────────
  // adjustment comes from the Adaptive Agent via WebSocket.
  // It is null until the server decides to change difficulty (cooldown: 15s).
  useEffect(() => {
    if (sceneRef.current && adjustment) {
      sceneRef.current.applyParams(adjustment);
    }
  }, [adjustment]);

  // ── Phaser lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type:            Phaser.AUTO,
      width:           900,           // STEP 3: match your design
      height:          560,
      parent:          containerRef.current,
      backgroundColor: '#f0f4ff',
      banner:          false,
      scene:           TemplateScene, // STEP 2: your scene class
    });

    gameRef.current.scene.start('TemplateScene', { // STEP 2: your scene key
      config:    GAME_CONFIG,
      onAction:  sendEvent,
      sessionId,
      userId:    'anonymous', // TODO: replace with userId from AuthContext
      onReady:   (scene: TemplateScene) => { sceneRef.current = scene; }, // STEP 2
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Back button */}
      <div style={{ alignSelf: 'flex-start', padding: '8px 12px' }} dir="rtl">
        <button
          onClick={() => navigate('/games')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
      </div>

      {/* Debug: WS connection status (remove in production) */}
      {!isConnected && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
          ⚠ game-server not connected — events won't reach Kafka
        </div>
      )}

      {/* Phaser canvas mounts here */}
      <div ref={containerRef} />
    </div>
  );
}
