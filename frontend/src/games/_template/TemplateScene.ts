import Phaser from 'phaser';
import type { GameEvent, GameEventType, DifficultyParams } from '../../types/game.types';

// ── Init data contract ─────────────────────────────────────────────────────────
// This is what TemplatePage passes into Phaser via game.scene.start(key, data).
// Every game must honour this exact interface — fireAction and applyParams give
// the scene its two communication channels with the outside world.

interface SceneInitData {
  config:   Record<string, unknown>;                 // STEP 3: your game config object
  onAction: (event: GameEvent) => void;              // receives events → hook → Kafka
  onReady:  (scene: TemplateScene) => void;          // exposes scene ref to React component
  // Injected by TemplatePage; the scene never reads these from localStorage/context:
  gameId:    string;
  sessionId: string;
  userId:    string;
}

// ── Scene ──────────────────────────────────────────────────────────────────────

export class TemplateScene extends Phaser.Scene {
  // Injected via init()
  protected cfg!:     Record<string, unknown>; // read in create() / applyParams()
  private onAction!:  (event: GameEvent) => void;
  private gameId!:    string;
  private sessionId!: string;
  private userId!:    string;

  // TODO: declare your game-specific properties here
  // private score = 0;
  // private isRoundActive = false;

  constructor() {
    super({ key: 'TemplateScene' }); // STEP 2: rename key to match your game
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  init(data: SceneInitData) {
    this.cfg       = data.config;
    this.onAction  = data.onAction;
    this.gameId    = data.gameId;
    this.sessionId = data.sessionId;
    this.userId    = data.userId;
  }

  create() {
    // TODO: STEP 2 — build your game here
    // this.createBackground();
    // this.createUI();
    // this.startRound();

    // Always call onReady at the END of create() so the React wrapper can
    // store a ref to this scene and call applyParams() when adjustments arrive.
    (this.sys.settings.data as SceneInitData).onReady(this);
  }

  update(_time: number, _delta: number) {
    // TODO: STEP 2 — game loop (movement, timers, countdown UI, etc.)
  }

  // ── Adaptive difficulty ───────────────────────────────────────────────────────
  // Called by TemplatePage when the server sends a DifficultyUpdate via WebSocket.
  // Apply relevant fields to your running game — take effect next round.

  public applyParams(params: DifficultyParams): void {
    // TODO: STEP 2 — apply params that are meaningful for your game
    // Examples:
    //   if (typeof params.timeoutMs === 'number') this.cfg.reactionWindowMs = params.timeoutMs;
    //   if (typeof params.objectCount === 'number') this.cfg.shapeCount = params.objectCount;
    console.log('[TemplateScene] applyParams received:', params);
  }

  // ── Event emission ────────────────────────────────────────────────────────────
  // This is the ONLY way a scene should emit events.
  // Never call WebSocket or Kafka directly from a scene.

  protected fireAction(
    type:        GameEventType,
    payload:     Record<string, unknown> = {},
    reactionMs?: number,
    correct?:    boolean,
  ): void {
    this.onAction({
      gameId:    this.gameId    as GameEvent['gameId'],
      sessionId: this.sessionId,
      userId:    this.userId,
      type,
      timestamp: Date.now(),
      reactionMs,
      correct,
      payload,
    });
  }
}
