import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import './ShapesClick.css';

// ─── Types ────────────────────────────────────────────────────────

export interface GameConfig {
  canvasWidth:     number;
  canvasHeight:    number;
  circleLifeMs:    number;   // how long the circle stays on screen
  spawnIntervalMs: number;   // gap between rounds
  distractorCount: number;   // decoy shapes that must NOT be clicked
}

export interface GameAction {
  type: 'ROUND_START' | 'CIRCLE_HIT' | 'DISTRACTOR_CLICK' | 'TIMEOUT';
  timestamp: number;
  payload: Record<string, unknown>;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:     900,
  canvasHeight:    560,
  circleLifeMs:    3000,
  spawnIntervalMs: 1200,
  distractorCount: 0,
};

// Vibrant circle colors (Material Design)
const CIRCLE_COLORS = [0xe53935, 0x8e24aa, 0x1e88e5, 0x00897b, 0xf4511e];

type DistractorShape = 'square' | 'triangle' | 'diamond';
const DISTRACTOR_SHAPES: DistractorShape[] = ['square', 'triangle', 'diamond'];

// ─── Phaser Scene ─────────────────────────────────────────────────

class ShapesScene extends Phaser.Scene {
  private config: GameConfig = DEFAULT_CONFIG;
  private onAction?: (action: GameAction) => void;
  private onReady?: (scene: ShapesScene) => void;

  // Round state
  private circleContainer:   Phaser.GameObjects.Container | null = null;
  private distractors:       Phaser.GameObjects.Container[] = [];
  private circlePos =        { x: 0, y: 0 };
  private circleStartTime =  0;
  private isCircleActive =   false;
  private lifeTimer:         Phaser.Time.TimerEvent | null = null;

  // Score / streak
  private score  = 0;
  private streak = 0;

  // UI objects
  private scoreText!:    Phaser.GameObjects.Text;
  private streakText!:   Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private countdownRing!: Phaser.GameObjects.Graphics;
  private waitDot!:       Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ShapesScene' });
  }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (action: GameAction) => void;
    onReady?:  (scene: ShapesScene) => void;
  }) {
    if (data.config)   this.config   = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
  }

  create() {
    this.createBackground();
    this.createUI();
    this.countdownRing = this.add.graphics().setDepth(5);
    this.scheduleNextSpawn(800);
    this.onReady?.(this);
  }

  // Called when server sends an adjustment — takes effect next round
  public applyParams(params: GameAdjustment) {
    if (typeof params.circleLifeMs === 'number') {
      this.config = { ...this.config, circleLifeMs: Math.max(500, params.circleLifeMs) };
    }
    if (typeof params.distractorCount === 'number') {
      this.config = { ...this.config, distractorCount: Math.max(0, Math.round(params.distractorCount)) };
    }
  }

  // ── Background ──────────────────────────────────────────────────

  private createBackground() {
    const { canvasWidth: w, canvasHeight: h } = this.config;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xe0f2fe, 0xe0f2fe, 0xf0f9ff, 0xf0f9ff, 1);
    bg.fillRect(0, 0, w, h);

    // Subtle grid
    const grid = this.add.graphics();
    grid.lineStyle(1, 0xbae6fd, 0.4);
    for (let x = 0; x <= w; x += 80) grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 80) grid.lineBetween(0, y, w, y);
  }

  // ── UI ──────────────────────────────────────────────────────────

  private createUI() {
    const { canvasWidth: w, canvasHeight: h } = this.config;

    // Score — top left
    this.add.rectangle(70, 38, 120, 52, 0xffffff, 0.9).setStrokeStyle(2, 0x0ea5e9).setDepth(10);
    this.add.text(70, 22, 'ניקוד', { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' })
      .setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(70, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#0369a1',
    }).setOrigin(0.5).setDepth(10);

    // Streak — top right
    this.add.rectangle(w - 70, 38, 120, 52, 0xffffff, 0.9).setStrokeStyle(2, 0x0ea5e9).setDepth(10);
    this.add.text(w - 70, 22, 'רצף', { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' })
      .setOrigin(0.5).setDepth(10);
    this.streakText = this.add.text(w - 70, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#0369a1',
    }).setOrigin(0.5).setDepth(10);

    // Bottom instruction
    this.add.rectangle(w / 2, h - 22, 260, 30, 0xffffff, 0.7)
      .setStrokeStyle(1, 0xbae6fd).setDepth(10);
    this.add.text(w / 2, h - 22, 'לחץ על העיגול בלבד', {
      fontSize: '13px', fontFamily: 'Arial', color: '#64748b', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    // Feedback text (center, big)
    this.feedbackText = this.add.text(w / 2, h / 2, '', {
      fontSize: '72px', fontFamily: 'Arial Black', color: '#1a237e',
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    // Waiting indicator (pulses between rounds)
    this.waitDot = this.add.text(w / 2, h / 2, '●', {
      fontSize: '28px', fontFamily: 'Arial', color: '#93c5fd',
    }).setOrigin(0.5).setAlpha(0).setDepth(3);

    this.tweens.add({
      targets:  this.waitDot,
      alpha:    0.6,
      duration: 700,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  // ── Round spawning ───────────────────────────────────────────────

  private scheduleNextSpawn(delayMs?: number) {
    this.waitDot.setAlpha(0.3);
    this.time.delayedCall(delayMs ?? this.config.spawnIntervalMs, this.spawnCircle, [], this);
  }

  private spawnCircle() {
    const { canvasWidth: w, canvasHeight: h, distractorCount } = this.config;

    this.waitDot.setAlpha(0);

    // Pick random position (avoid top UI area and edges)
    const x = Phaser.Math.Between(100, w - 100);
    const y = Phaser.Math.Between(120, h - 80);
    this.circlePos = { x, y };

    // Spawn circle
    this.circleContainer = this.createCircle(x, y);

    // Spawn distractors (spaced away from circle and each other)
    const placed: { x: number; y: number }[] = [{ x, y }];
    for (let i = 0; i < distractorCount; i++) {
      const pos = this.findFreePosition(placed, w, h);
      placed.push(pos);
      const d = this.createDistractor(pos.x, pos.y);
      this.distractors.push(d);
    }

    this.isCircleActive  = true;
    this.circleStartTime = Date.now();

    this.lifeTimer = this.time.addEvent({
      delay:         this.config.circleLifeMs,
      callback:      this.onTimeout,
      callbackScope: this,
    });

    this.fireAction('ROUND_START', { distractorCount });
  }

  private findFreePosition(
    placed: { x: number; y: number }[],
    w: number, h: number,
  ): { x: number; y: number } {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Phaser.Math.Between(80, w - 80);
      const y = Phaser.Math.Between(110, h - 60);
      if (placed.every(p => Math.hypot(x - p.x, y - p.y) > 120)) {
        return { x, y };
      }
    }
    return { x: Phaser.Math.Between(80, w - 80), y: Phaser.Math.Between(110, h - 60) };
  }

  // ── Shape creation ───────────────────────────────────────────────

  private createCircle(x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(6);
    const g     = this.add.graphics();
    const r     = 36;
    const color = Phaser.Utils.Array.GetRandom(CIRCLE_COLORS) as number;

    // Soft outer glow
    g.fillStyle(color, 0.12);
    g.fillCircle(0, 0, r + 14);

    // Main circle
    g.fillStyle(color);
    g.fillCircle(0, 0, r);

    // Inner highlight
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(-r * 0.3, -r * 0.3, r * 0.3);

    container.add(g);
    container.setSize((r + 14) * 2, (r + 14) * 2);
    container.setInteractive({ useHandCursor: true });

    // Entrance pop
    container.setScale(0);
    this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });

    container.on('pointerdown', () => this.onCircleClick());
    return container;
  }

  private createDistractor(x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(6);
    const g     = this.add.graphics();
    const type  = Phaser.Utils.Array.GetRandom(DISTRACTOR_SHAPES) as DistractorShape;
    const s     = 34;
    const s2    = s / 2;

    g.fillStyle(0xa8a29e);         // warm gray
    g.lineStyle(2, 0x78716c);

    switch (type) {
      case 'square':
        g.fillRect(-s2, -s2, s, s); g.strokeRect(-s2, -s2, s, s); break;
      case 'triangle': {
        const pts = [{ x: 0, y: -s2 }, { x: s2, y: s2 }, { x: -s2, y: s2 }];
        g.fillPoints(pts, true); g.strokePoints(pts, true); break;
      }
      case 'diamond': {
        const pts = [{ x: 0, y: -s2 }, { x: s2, y: 0 }, { x: 0, y: s2 }, { x: -s2, y: 0 }];
        g.fillPoints(pts, true); g.strokePoints(pts, true); break;
      }
    }

    container.add(g);
    container.setSize(s + 20, s + 20);
    container.setInteractive({ useHandCursor: true });

    container.setScale(0);
    this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut', delay: 60 });

    container.on('pointerdown', () => this.onDistractorClick(container));
    return container;
  }

  // ── Interaction ─────────────────────────────────────────────────

  private onCircleClick() {
    if (!this.isCircleActive) return;
    const reactionMs = Date.now() - this.circleStartTime;
    this.clearRound();

    this.score++;
    this.streak++;
    this.scoreText.setText(this.score.toString());
    this.streakText.setText(this.streak.toString());
    this.showFeedback('✓', '#16a34a');
    this.fireAction('CIRCLE_HIT', { reactionMs, streak: this.streak });

    this.scheduleNextSpawn();
  }

  private onDistractorClick(container: Phaser.GameObjects.Container) {
    if (!this.isCircleActive) return;
    this.streak = 0;
    this.streakText.setText('0');

    // Shake the wrong shape; circle stays alive
    this.tweens.add({ targets: container, x: container.x + 10, yoyo: true, repeat: 3, duration: 45 });
    this.showFeedback('✗', '#dc2626');
    this.fireAction('DISTRACTOR_CLICK', { reactionMs: Date.now() - this.circleStartTime });
  }

  private onTimeout() {
    if (!this.isCircleActive) return;
    this.streak = 0;
    this.streakText.setText('0');
    this.clearRound();
    this.showFeedback('⏱', '#ea580c');
    this.fireAction('TIMEOUT', {});
    this.scheduleNextSpawn();
  }

  private clearRound() {
    this.isCircleActive = false;
    this.lifeTimer?.destroy();
    this.lifeTimer = null;
    this.countdownRing.clear();

    this.circleContainer?.destroy();
    this.circleContainer = null;
    this.distractors.forEach(d => d.destroy());
    this.distractors = [];
  }

  private showFeedback(text: string, color: string) {
    const { canvasWidth: w, canvasHeight: h } = this.config;
    this.feedbackText
      .setPosition(w / 2, h / 2)
      .setText(text).setColor(color).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.feedbackText, scale: 1.2, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.feedbackText, alpha: 0, duration: 300, delay: 350 });
  }

  // ── Update — countdown ring ──────────────────────────────────────

  update() {
    if (!this.isCircleActive) return;

    const elapsed  = Date.now() - this.circleStartTime;
    const progress = Math.max(0, 1 - elapsed / this.config.circleLifeMs);

    const color = progress > 0.5 ? 0x22c55e : progress > 0.25 ? 0xf59e0b : 0xef4444;

    this.countdownRing.clear();
    this.countdownRing.lineStyle(5, color, 0.85);
    this.countdownRing.beginPath();
    this.countdownRing.arc(
      this.circlePos.x, this.circlePos.y,
      50,                          // radius slightly outside the circle (r=36)
      -Math.PI / 2,
      -Math.PI / 2 + progress * Math.PI * 2,
      false,
    );
    this.countdownRing.strokePath();

    // Pulse effect when nearly out of time
    if (progress < 0.25 && this.circleContainer) {
      const pulse = 1 + 0.07 * Math.sin(Date.now() * 0.018);
      this.circleContainer.setScale(pulse);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private fireAction(type: GameAction['type'], payload: Record<string, unknown>) {
    this.onAction?.({ type, timestamp: Date.now(), payload });
  }
}

// ─── React Component ──────────────────────────────────────────────

interface ShapesClickProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function ShapesClick({ config, onAction, adjustment }: ShapesClickProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<ShapesScene | null>(null);

  const mergedConfig: GameConfig = { ...DEFAULT_CONFIG, ...config };

  const handleAction = useCallback((action: GameAction) => {
    onAction?.(action);
  }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  useEffect(() => {
    if (!containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type:            Phaser.AUTO,
      width:           mergedConfig.canvasWidth,
      height:          mergedConfig.canvasHeight,
      parent:          containerRef.current,
      backgroundColor: '#e0f2fe',
      banner:          false,
      scene:           ShapesScene,
    });

    gameRef.current.scene.start('ShapesScene', {
      config:   mergedConfig,
      onAction: handleAction,
      onReady:  (scene: ShapesScene) => { sceneRef.current = scene; },
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="shapes-click-game">
      <div className="game-back-row" dir="rtl">
        <button
          onClick={() => navigate('/games')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
      </div>
      <div ref={containerRef} className="game-canvas" />
    </div>
  );
}
